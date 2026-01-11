'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PlaylistItem } from '@/types/playlist';
import { FallbackContent } from '../FallbackContent';
import { isRaspberryPi } from '@/lib/device-detection';

interface OptimizedImageRendererProps {
  item: PlaylistItem;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  preload?: boolean;
  displaySettings?: { isRaspberryPi?: boolean };
}

// Global image cache to persist across component instances
const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

// Preload an image and cache it
function preloadImage(url: string): Promise<HTMLImageElement> {
  // Check if already cached
  if (imageCache.has(url)) {
    return Promise.resolve(imageCache.get(url)!);
  }

  // Check if already loading
  if (loadingPromises.has(url)) {
    return loadingPromises.get(url)!;
  }

  // Create new loading promise
  const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      imageCache.set(url, img);
      loadingPromises.delete(url);
      resolve(img);
    };

    img.onerror = () => {
      loadingPromises.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };

    // Set crossOrigin to handle CORS
    img.crossOrigin = 'anonymous';
    img.src = url;
  });

  loadingPromises.set(url, loadPromise);
  return loadPromise;
}

export function OptimizedImageRenderer({ item, onError, onLoad, preload = false, displaySettings }: OptimizedImageRendererProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);
  const imageRef = useRef<HTMLImageElement>(null);
  const isRPi = useRef(isRaspberryPi(displaySettings));
  const maxRetries = 3;
  const retryDelay = 2000;

  // Get image URL
  const getImageUrl = useCallback(() => {
    if (item.content?.fileUrl) {
      return item.content.fileUrl;
    } else if (item.thumbnail) {
      return item.thumbnail;
    } else {
      return `/api/placeholder/1920/1080?text=${encodeURIComponent(item.title)}`;
    }
  }, [item]);

  const imageUrl = getImageUrl();

  // Load image with caching
  const loadImage = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setError(null);
      const img = await preloadImage(imageUrl);

      if (!mountedRef.current) return;

      setIsReady(true);
      setRetryCount(0);

      if (onLoad) {
        onLoad();
      }
    } catch (err) {
      if (!mountedRef.current) return;

      console.error('Image load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load image');

      // Auto-retry if within retry limit
      if (retryCount < maxRetries) {
        setTimeout(() => {
          if (mountedRef.current) {
            setRetryCount(prev => prev + 1);
            loadImage();
          }
        }, retryDelay);
      } else if (onError) {
        onError(err instanceof Error ? err : new Error('Failed to load image'));
      }
    }
  }, [imageUrl, retryCount, onError, onLoad]);

  // Effect to load image
  useEffect(() => {
    mountedRef.current = true;

    // Only load if not in preload mode or if we should display
    if (!preload) {
      loadImage();
    } else {
      // In preload mode, just cache the image without setting ready state
      preloadImage(imageUrl).catch(err => {
        console.error('Preload failed:', err);
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, [imageUrl, preload, loadImage]);

  // If in preload mode, don't render anything
  if (preload) {
    return null;
  }

  // Get styling properties
  const backgroundColor = item.content?.backgroundColor ||
                         item.backgroundColor ||
                         item.cropSettings?.backgroundColor ||
                         '#000000';

  const imageScale = item.content?.metadata?.imageScale || item.imageScale || 'contain';
  const imageSize = item.content?.metadata?.imageSize || 100;

  let objectFit: 'contain' | 'cover' | 'fill';
  if (imageScale === 'cover') {
    objectFit = 'cover';
  } else if (imageScale === 'fill') {
    objectFit = 'fill';
  } else {
    objectFit = 'contain';
  }

  const scalingStyle = imageScale === 'contain' && imageSize !== 100 ? {
    width: 'auto',
    height: 'auto',
    maxWidth: `${imageSize}%`,
    maxHeight: `${imageSize}%`,
    objectFit: objectFit
  } : {
    width: '100%',
    height: '100%',
    objectFit: objectFit
  };

  // Show error state after max retries
  if (error && retryCount >= maxRetries) {
    return (
      <FallbackContent
        type="loading-error"
        message={`Unable to display image: ${item.title}`}
        onRetry={() => {
          setRetryCount(0);
          loadImage();
        }}
        showRetryButton={true}
      />
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor }}
    >
      {/* Only show loading state on non-Pi devices */}
      {!isRPi.current && !isReady && !error && retryCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-2xl opacity-50">Loading...</div>
        </div>
      )}

      {/* Always render the img tag but control visibility */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt={item.title}
        style={{
          ...scalingStyle,
          opacity: isReady ? 1 : 0,
          transition: isRPi.current ? 'opacity 0.2s linear' : 'opacity 0.2s ease-in-out'
        }}
        loading="eager"
        decoding="sync"
      />
    </div>
  );
}

export default OptimizedImageRenderer;
