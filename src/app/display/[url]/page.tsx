'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import DisplayPlayer from '@/components/player/DisplayPlayer';
import PlayerErrorBoundary from '@/components/player/PlayerErrorBoundary';
import { FallbackContent } from '@/components/player/FallbackContent';
import { ClockOverlay } from '@/components/player/ClockOverlay';
import type { ClockConfig } from '@/components/displays/ClockSettings';
import { Display } from '@/types/display';
import { Playlist } from '@/types/playlist';
import { useSocketConnection } from '@/hooks/useSocketConnection';

// Default clock settings to use if invalid or missing
const DEFAULT_CLOCK_SETTINGS: ClockConfig = {
  enabled: false,
  position: 'top-right',
  size: 'medium',
  format: '12h',
  showSeconds: true,
  showDate: false,
  opacity: 80,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  fontFamily: 'digital',
  offsetX: 20,
  offsetY: 20,
};

// Helper function to validate and normalize clock settings
const getValidClockSettings = (settings: any): ClockConfig | null => {
  if (!settings || typeof settings !== 'object') {
    return null;
  }

  // Ensure all required properties exist
  const validSettings: ClockConfig = {
    enabled: settings.enabled === true,
    position: settings.position || DEFAULT_CLOCK_SETTINGS.position,
    size: settings.size || DEFAULT_CLOCK_SETTINGS.size,
    format: settings.format || DEFAULT_CLOCK_SETTINGS.format,
    showSeconds: settings.showSeconds !== false,
    showDate: settings.showDate === true,
    opacity: typeof settings.opacity === 'number' ? settings.opacity : DEFAULT_CLOCK_SETTINGS.opacity,
    color: settings.color || DEFAULT_CLOCK_SETTINGS.color,
    backgroundColor: settings.backgroundColor || DEFAULT_CLOCK_SETTINGS.backgroundColor,
    fontFamily: settings.fontFamily || DEFAULT_CLOCK_SETTINGS.fontFamily,
    offsetX: typeof settings.offsetX === 'number' ? settings.offsetX : DEFAULT_CLOCK_SETTINGS.offsetX,
    offsetY: typeof settings.offsetY === 'number' ? settings.offsetY : DEFAULT_CLOCK_SETTINGS.offsetY,
  };

  return validSettings.enabled ? validSettings : null;
};

export default function DisplayViewerPage() {
  const params = useParams();
  const uniqueUrl = params.url as string;
  const [display, setDisplay] = useState<Display | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerConnectionStatus, setPlayerConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  // Use useCallback with proper dependencies for stable function reference
  const fetchDisplay = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`/api/display/${uniqueUrl}`, {
        cache: 'no-cache',  // Force fresh data
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error('Display not found');
      }
      const data = await response.json();

      // Only log and check for changes during polling
      if (isPolling) {
        console.log('Polling - Fetched display data:', data);
        console.log('Current playlist ID:', playlist?.id);
        console.log('New playlist ID:', data.assignedPlaylist?.id);

        // Don't reload the page when setting to null - let React handle the transition
        // The page reload was causing the error boundary issues

        // Check if playlist has actually changed (but not to/from null)
        const playlistChanged =
          data.assignedPlaylist && playlist && (
            (playlist?.id !== data.assignedPlaylist?.id) ||
            (playlist?.items?.length !== data.assignedPlaylist?.items?.length)
          );

        if (playlistChanged) {
          console.log('Playlist changed detected, reloading page...');
          // Clear any cached data
          localStorage.removeItem(`isodisplay_playlist_${display?.id}`);
          // Force a full page reload
          setTimeout(() => window.location.reload(), 100);
          return;
        }
      }

      // Normal update without reload
      setDisplay(data);

      if (data.assignedPlaylist) {
        setPlaylist(data.assignedPlaylist);
        setError(null);
      } else {
        setPlaylist(null);
        // Only set error if no display found
        if (!data) {
          setError('No content available');
        } else {
          setError(null);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching display:', err);
      setError('Failed to load display');
      setLoading(false);
    }
  }, [uniqueUrl, display?.id, playlist?.id, playlist?.items?.length]);

  // Handle remote commands with useCallback
  const handleRemoteCommand = useCallback((command: any) => {
    switch (command.action) {
      case 'reload':
        window.location.reload();
        break;
      case 'refresh_content':
        fetchDisplay();
        break;
      case 'clear_cache':
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
          });
        }
        break;
    }
  }, [fetchDisplay]);

  // Initialize Socket.io connection
  // Always keep WebSocket connected even if display is null, so we can receive updates
  useSocketConnection({
    displayId: display?.id,
    displaySlug: display?.uniqueUrl || uniqueUrl,
    onPlaylistUpdate: (updatedPlaylist) => {
      console.log('Received playlist update via WebSocket:', updatedPlaylist);
      // Clear any cached playlists first
      if (display?.id) {
        localStorage.removeItem(`isodisplay_playlist_${display.id}`);
      }
      // Update the playlist directly without reloading
      // Use setTimeout to ensure React has time to process the state change
      setTimeout(() => {
        if (updatedPlaylist !== undefined) {
          setPlaylist(updatedPlaylist);
          setError(null);
          setLoading(false);
        }
      }, 0);
    },
    onDisplayUpdate: (updatedDisplay) => {
      console.log('Display update received:', updatedDisplay);
      
      // Clear any cached playlists when display updates
      if (display?.id) {
        localStorage.removeItem(`isodisplay_playlist_${display.id}`);
      }
      
      // Update the display
      setDisplay(updatedDisplay);
      setLoading(false); // Clear loading state when we receive display update
      
      // Update the playlist based on what's in the display update
      if (updatedDisplay?.assignedPlaylist) {
        setPlaylist(updatedDisplay.assignedPlaylist);
        setError(null);
      } else if (updatedDisplay?.assignedPlaylist === null) {
        // Explicitly set to null (none selected)
        setPlaylist(null);
        setError(null); // Don't show error, let the "no content" message show
      } else {
        // Clear the playlist if none is assigned
        setPlaylist(null);
        // Only set error if we don't have display data at all
        if (!updatedDisplay) {
          setError('Display not found');
        }
      }
      
      // Force a re-render if refresh flag is set
      if (updatedDisplay?.refresh) {
        console.log('Refresh flag detected, updating display...');
        setLoading(false);
      }
    },
    onContentUpdate: (content) => {
      if (content.refresh) {
        fetchDisplay();
      }
    },
    onCommand: handleRemoteCommand,
    onInitialData: (data) => {
      if (data.display) {
        setDisplay(data.display);
        setLoading(false);
      }
      if (data.playlist) {
        setPlaylist(data.playlist);
        setError(null);
      } else if (data.playlist === null) {
        setPlaylist(null);
        setError(null);
      }
    },
    enabled: true, // Always enabled to receive updates even when showing error/no-content
  });

  const isDisplayConnected = playerConnectionStatus === 'connected';

  useEffect(() => {
    if (!uniqueUrl) return;

    // Initial fetch
    fetchDisplay(false);

    // Safety net polling in case websocket updates fail
    const interval = setInterval(() => {
      fetchDisplay(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [uniqueUrl, fetchDisplay]);


  if (loading) {
    return (
      <FallbackContent 
        type="loading-error"
        message="Connecting to display server..."
        displayName={uniqueUrl}
        isConnected={isDisplayConnected}
      />
    );
  }

  if (error) {
    return (
      <FallbackContent 
        type="network-error"
        message={error}
        displayName={uniqueUrl}
        onRetry={() => fetchDisplay(false)}
        showRetryButton={true}
        isConnected={isDisplayConnected}
      />
    );
  }

  if (!playlist || !display) {
    return (
      <FallbackContent 
        type="no-content"
        message="This display has no content assigned. Please assign a playlist from the admin interface."
        displayName={display?.name || uniqueUrl}
        isConnected={isDisplayConnected}
      />
    );
  }

  return (
    <PlayerErrorBoundary 
      key={`player-${display.id}-${playlist?.id || 'no-playlist'}`} // Force remount when playlist changes
      displayId={display.id}
      onError={(error, errorInfo) => {
        console.error('Player error:', error, errorInfo);
        // Could send error to monitoring service here
      }}
    >
      <div className="relative w-full h-full">
        <DisplayPlayer 
          display={display} 
          playlist={playlist}
          onConnectionStatusChange={setPlayerConnectionStatus}
        />
        
        {/* Clock Overlay */}
        {display.clockSettings && getValidClockSettings(display.clockSettings) && (
          <ClockOverlay settings={getValidClockSettings(display.clockSettings)!} />
        )}
        
      </div>
    </PlayerErrorBoundary>
  );
}
