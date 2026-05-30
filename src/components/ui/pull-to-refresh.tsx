'use client';

/**
 * Pull to Refresh Component
 *
 * Mobile-friendly pull-to-refresh gesture handler.
 * Only activates when at the top of the scroll container and on touch devices.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  /** Minimum pull distance to trigger refresh (default: 80px) */
  threshold?: number;
  /** Maximum pull distance (default: 120px) */
  maxPull?: number;
  /** Whether to show the refresh indicator (default: true) */
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPull = 120,
  enabled = true,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  // Check if we're at the top of the page
  const isAtTop = useCallback(() => {
    return window.scrollY <= 0;
  }, []);

  // Check if this is a touch device
  const isTouchDevice = useCallback(() => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshing || !isAtTop() || !isTouchDevice()) return;
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = e.touches[0].clientY;
    },
    [enabled, isRefreshing, isAtTop, isTouchDevice]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshing || startYRef.current === 0) return;

      currentYRef.current = e.touches[0].clientY;
      const diff = currentYRef.current - startYRef.current;

      // Only pull down, not up
      if (diff > 0 && isAtTop()) {
        // Apply resistance - the further you pull, the harder it gets
        const resistance = 0.5;
        const adjustedDiff = Math.min(diff * resistance, maxPull);
        setPullDistance(adjustedDiff);
        setIsPulling(true);

        // Prevent default scroll behavior when pulling
        if (adjustedDiff > 10) {
          e.preventDefault();
        }
      }
    },
    [enabled, isRefreshing, isAtTop, maxPull]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshing) return;

    const shouldRefresh = pullDistance >= threshold;

    if (shouldRefresh) {
      setIsRefreshing(true);
      setPullDistance(threshold); // Keep at threshold during refresh

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    // Reset
    setPullDistance(0);
    setIsPulling(false);
    startYRef.current = 0;
    currentYRef.current = 0;
  }, [enabled, isRefreshing, pullDistance, threshold, onRefresh]);

  // Add touch event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Use passive: false to allow preventDefault on touchmove
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Calculate progress (0 to 1)
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      {enabled && (
        <div
          className={cn(
            'absolute left-0 right-0 flex justify-center pointer-events-none transition-opacity duration-200 z-50',
            showIndicator ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            top: -48,
            transform: `translateY(${pullDistance}px)`,
          }}
        >
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700',
              isRefreshing && 'animate-pulse'
            )}
          >
            <RefreshCw
              className={cn(
                'h-5 w-5 text-rh-green transition-transform',
                isRefreshing && 'animate-spin'
              )}
              style={{
                transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Content with pull transform */}
      <div
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : undefined,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
