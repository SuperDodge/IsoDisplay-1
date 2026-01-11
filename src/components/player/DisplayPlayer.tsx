'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Display } from '@/types/display';
import { Playlist, PlaylistItem } from '@/types/playlist';
import TransitionContainer from './TransitionContainer';
import { OptimizedImageRenderer } from './renderers/OptimizedImageRenderer';
import { VideoRenderer } from './renderers/VideoRenderer';
import VerticalVideoRenderer from './renderers/VerticalVideoRenderer';
import { PDFRenderer } from './renderers/PDFRenderer';
import { YouTubeRenderer } from './renderers/YouTubeRenderer';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useDisplayWebSocket } from '@/hooks/useWebSocket';
import { usePerformanceOptimization } from '@/lib/performance';
import { playlistCache } from '@/lib/services/playlist-cache';
import { useImagePreloader } from '@/hooks/useImagePreloader';
import { getPreloadConfig } from './config/preload-config';
import type {
  PlaylistUpdateMessage,
  DisplayControlMessage,
  EmergencyStopMessage,
} from '@/types/websocket';

interface DisplayPlayerProps {
  display: Display;
  playlist: Playlist;
  onConnectionStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export function DisplayPlayer({ display, playlist: initialPlaylist, onConnectionStatusChange }: DisplayPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentItem, setCurrentItem] = useState<PlaylistItem | null>(
    initialPlaylist?.items?.[0] ?? null
  );
  const [nextItem, setNextItem] = useState<PlaylistItem | null>(
    initialPlaylist?.items?.[1] ?? null
  );
  const [playlist, setPlaylist] = useState<Playlist>(initialPlaylist);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('connecting');
  const playerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout>();
  const viewStartTimeRef = useRef<number>(Date.now());
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen(playerRef);

  // Safety check - if no playlist provided, show error
  if (!initialPlaylist) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-2xl mb-4">No Playlist Assigned</h2>
          <p className="text-gray-400">Please assign a playlist to this display from the admin interface.</p>
        </div>
      </div>
    );
  }

  // Performance optimization for Raspberry Pi
  const { metrics, quality, optimizer } = usePerformanceOptimization();

  // Get preload configuration
  const preloadConfig = getPreloadConfig({ isRaspberryPi: display.isRaspberryPi });

  // Preload upcoming images to prevent loading text on Pi
  useImagePreloader(playlist.items, currentIndex, {
    enabled: preloadConfig.enabled,
    preloadCount: preloadConfig.preloadCount,
    cacheSize: preloadConfig.cacheSize
  });

  // Initialize WebSocket connection
  const {
    connectionStatus: wsStatus,
    lastMessage,
    sendStatusUpdate,
  } = useDisplayWebSocket(display.id, display.uniqueUrl);

  const playlistsEqual = useCallback((a: Playlist | null, b: Playlist | null): boolean => {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;

    const itemsA = a.items || [];
    const itemsB = b.items || [];

    if (itemsA.length !== itemsB.length) return false;

    for (let i = 0; i < itemsA.length; i++) {
      const itemA = itemsA[i];
      const itemB = itemsB[i];

      if (
        itemA.id !== itemB.id ||
        itemA.contentId !== itemB.contentId ||
        itemA.order !== itemB.order ||
        itemA.duration !== itemB.duration ||
        itemA.transition !== itemB.transition ||
        itemA.transitionDuration !== itemB.transitionDuration
      ) {
        return false;
      }
    }

    return true;
  }, []);

  const hasInitialized = useRef(false);

  const applyPlaylist = useCallback((
    nextPlaylist: Playlist | null | undefined,
    force = false
  ) => {
    if (!nextPlaylist) return;
    const normalizedItems = nextPlaylist.items || [];
    const normalizedPlaylist: Playlist = {
      ...nextPlaylist,
      items: normalizedItems,
    } as Playlist;

    if (!force && hasInitialized.current && playlistsEqual(normalizedPlaylist, playlist)) {
      return;
    }

    setPlaylist(normalizedPlaylist);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    const firstItem = normalizedPlaylist.items[0] ?? null;
    const secondItem = normalizedPlaylist.items[1] ?? null;

    setCurrentIndex(0);
    setCurrentItem(firstItem);
    setNextItem(secondItem);
    viewStartTimeRef.current = Date.now();

    playlistCache.cachePlaylist(display.id, normalizedPlaylist);

    const preloadUrls = normalizedPlaylist.items
      .slice(0, 3)
      .map((item) => {
        if (item.contentType === 'youtube') return null;
        return item.content?.fileUrl;
      })
      .filter(Boolean) as string[];

    if (preloadUrls.length > 0) {
      optimizer.preloadContent(preloadUrls);
    }

    hasInitialized.current = true;
  }, [display.id, optimizer, playlist, playlistsEqual]);

  useEffect(() => {
    if (!hasInitialized.current) {
      applyPlaylist(initialPlaylist, true);
      return;
    }

    if (!playlistsEqual(initialPlaylist, playlist)) {
      applyPlaylist(initialPlaylist);
    }
  }, [initialPlaylist, applyPlaylist, playlist, playlistsEqual]);

  // Update connection status and handle offline mode
  useEffect(() => {
    setConnectionStatus(wsStatus);
    onConnectionStatusChange?.(wsStatus);

    // Load cached playlist if disconnected
    if (wsStatus === 'disconnected' || wsStatus === 'error') {
      const cachedPlaylist = playlistCache.getCachedPlaylist(display.id);
      if (cachedPlaylist && cachedPlaylist.id !== playlist.id) {
        setPlaylist(cachedPlaylist);
      }
    }
  }, [wsStatus, display.id, playlist.id, onConnectionStatusChange]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'playlist_update':
        const playlistMsg = lastMessage as PlaylistUpdateMessage;
        if (playlistMsg.data.displayIds.includes(display.id)) {
          const newPlaylist = playlistMsg.data.playlist as Playlist | undefined;
          applyPlaylist(newPlaylist);
        }
        break;

      case 'display_control':
        const controlMsg = lastMessage as DisplayControlMessage;
        if (controlMsg.data.displayId === display.id) {
          handleRemoteControl(controlMsg.data.action, controlMsg.data.value);
        }
        break;

      case 'emergency_stop':
        const stopMsg = lastMessage as EmergencyStopMessage;
        if (stopMsg.data.displayIds === 'all' || stopMsg.data.displayIds.includes(display.id)) {
          setIsPlaying(false);
          sendStatusUpdate('paused', currentIndex);
        }
        break;
    }
  }, [lastMessage, display.id, currentIndex, sendStatusUpdate, applyPlaylist]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track view analytics
  const trackView = useCallback(
    async (completed: boolean, skipped: boolean = false) => {
      if (!currentItem || !playlist) return;

      const viewDuration = Math.round((Date.now() - viewStartTimeRef.current) / 1000);

      try {
        await fetch('/api/tracking/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayId: display.id,
            playlistId: playlist.id,
            contentId: currentItem.contentId,
            duration: viewDuration,
            expectedDuration: currentItem.duration,
            completed,
            skipped,
          }),
        });
      } catch (error) {
        console.error('Failed to track view:', error);
      }
    },
    [currentItem, display.id, playlist?.id]
  );

  // Move to next item function with performance optimization
  const moveToNextItem = useCallback(() => {
    if (!playlist || playlist.items.length === 0) return;
    if (playlist.items.length === 1) {
      // Only one item, keep displaying indefinitely
      viewStartTimeRef.current = Date.now();
      return;
    }

    // Track the current item view as completed
    trackView(true, false);

    const nextIndex = (currentIndex + 1) % playlist.items.length;

    // Clean up memory before transition
    optimizer.cleanupMemory();

    // Update to next item - keep current for transition
    setCurrentIndex(nextIndex);
    setCurrentItem(playlist.items[nextIndex]);

    // Reset view timer for new item
    viewStartTimeRef.current = Date.now();

    // Preload next items
    const followingIndex = (nextIndex + 1) % playlist.items.length;
    setNextItem(playlist.items[followingIndex]);

    // Preload upcoming content
    const preloadUrls = [];
    for (let i = 1; i <= 2; i++) {
      const idx = (nextIndex + i) % playlist.items.length;
      if (playlist.items[idx]?.content?.fileUrl) {
        preloadUrls.push(playlist.items[idx].content.fileUrl);
      }
    }
    optimizer.preloadContent(preloadUrls);

    // Send status update
    sendStatusUpdate(isPlaying ? 'playing' : 'paused', nextIndex);
  }, [currentIndex, playlist.items, isPlaying, sendStatusUpdate, optimizer, trackView]);

  // Handle remote control commands
  const handleRemoteControl = useCallback(
    (action: string, value?: number) => {
      switch (action) {
        case 'play':
          setIsPlaying(true);
          sendStatusUpdate('playing', currentIndex);
          break;
        case 'pause':
          setIsPlaying(false);
          sendStatusUpdate('paused', currentIndex);
          break;
        case 'stop':
          setIsPlaying(false);
          setCurrentIndex(0);
          setCurrentItem(playlist.items[0] || null);
          sendStatusUpdate('paused', 0);
          break;
        case 'restart':
          setCurrentIndex(0);
          setCurrentItem(playlist.items[0] || null);
          setIsPlaying(true);
          sendStatusUpdate('playing', 0);
          break;
        case 'next':
          // Track current item as skipped
          trackView(false, true);
          moveToNextItem();
          break;
        case 'previous':
          // Track current item as skipped
          trackView(false, true);
          const prevIndex = currentIndex === 0 ? playlist.items.length - 1 : currentIndex - 1;
          setCurrentIndex(prevIndex);
          setCurrentItem(playlist.items[prevIndex]);
          viewStartTimeRef.current = Date.now(); // Reset timer
          sendStatusUpdate(isPlaying ? 'playing' : 'paused', prevIndex);
          break;
        case 'seek':
          if (typeof value === 'number' && value >= 0 && value < playlist.items.length) {
            setCurrentIndex(value);
            setCurrentItem(playlist.items[value]);
            sendStatusUpdate(isPlaying ? 'playing' : 'paused', value);
          }
          break;
      }
    },
    [currentIndex, playlist.items, isPlaying, sendStatusUpdate, moveToNextItem, trackView]
  );

  // Start playback timer
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }

    if (!isPlaying || !currentItem) {
      return;
    }

    if (playlist.items.length <= 1) {
      // Single item playlists should remain on screen indefinitely
      return;
    }

    const duration = currentItem.duration * 1000; // Convert to milliseconds

    timerRef.current = setTimeout(() => {
      moveToNextItem();
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [currentItem, isPlaying, moveToNextItem, playlist.items.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'F11':
          e.preventDefault();
          if (!isFullscreen) {
            enterFullscreen();
          }
          break;
        case 'Escape':
          if (isFullscreen) {
            exitFullscreen();
          }
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying((prev) => {
            const newState = !prev;
            sendStatusUpdate(newState ? 'playing' : 'paused', currentIndex);
            return newState;
          });
          break;
        case 'ArrowRight':
          trackView(false, true);
          moveToNextItem();
          break;
        case 'ArrowLeft':
          trackView(false, true);
          const prevIndex = currentIndex === 0 ? playlist.items.length - 1 : currentIndex - 1;
          setCurrentIndex(prevIndex);
          setCurrentItem(playlist.items[prevIndex]);
          viewStartTimeRef.current = Date.now();
          sendStatusUpdate(isPlaying ? 'playing' : 'paused', prevIndex);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    moveToNextItem,
    currentIndex,
    playlist.items,
    sendStatusUpdate,
    isPlaying,
    trackView,
  ]);

  const renderContent = (item: PlaylistItem | null, options?: { preload?: boolean }) => {
    if (!item) return null;

    // Handle both lowercase and uppercase content types
    const contentType = item.contentType?.toLowerCase();

    switch (contentType) {
      case 'image':
        return (
          <OptimizedImageRenderer
            item={item}
            preload={options?.preload}
            displaySettings={{ isRaspberryPi: display.isRaspberryPi }}
          />
        );
      case 'video':
        return <VerticalVideoRenderer item={item} isPlaying={isPlaying} onEnded={moveToNextItem} />;
      case 'pdf':
        return <PDFRenderer item={item} />;
      case 'youtube':
        return <YouTubeRenderer item={item} onEnded={moveToNextItem} />;
      default:
        return (
          <div className="flex items-center justify-center h-full bg-black">
            <div className="text-white text-2xl">Unsupported content type: {item.contentType}</div>
          </div>
        );
    }
  };

  return (
    <div
      ref={playerRef}
      className={`h-screen w-screen bg-black relative overflow-hidden cursor-none gpu-accelerated quality-${quality}`}
      onDoubleClick={enterFullscreen}
    >
      <TransitionContainer
        transition={currentItem?.transition || 'fade'}
        duration={currentItem?.transitionDuration || 1}
        contentKey={currentIndex}
        displaySettings={{ isRaspberryPi: display.isRaspberryPi }}
      >
        {renderContent(currentItem)}
      </TransitionContainer>

      {/* Preload next item */}
      {nextItem && (
        <div className="hidden" aria-hidden="true">
          {renderContent(nextItem, { preload: true })}
        </div>
      )}

      {/* Debug info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 left-4 text-white bg-black/50 p-2 rounded text-sm space-y-1">
          <div>Display: {display.name}</div>
          <div>
            Item: {currentIndex + 1}/{playlist.items.length}
          </div>
          <div>Playing: {isPlaying ? 'Yes' : 'No'}</div>
          <div>Fullscreen: {isFullscreen ? 'Yes' : 'No'}</div>
          <div className="flex items-center gap-2">
            <span>WebSocket:</span>
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-green-500'
                  : connectionStatus === 'connecting'
                    ? 'bg-yellow-500'
                    : connectionStatus === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-500'
              }`}
            ></span>
            <span className="text-xs">{connectionStatus}</span>
          </div>
          <div className="border-t border-white/20 mt-2 pt-2">
            <div>Quality: {quality}</div>
            <div>FPS: {metrics.fps}</div>
            <div>Memory: {metrics.memoryUsage}MB</div>
            <div>Frame Drops: {metrics.frameDrops}</div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DisplayPlayer;
