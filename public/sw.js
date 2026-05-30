/**
 * Service Worker for Average Joe Trades PWA
 *
 * This minimal service worker enables:
 * - PWA installation on mobile devices
 * - Caching of static assets for faster loading
 * - Network-first strategy for API calls (data must be live)
 */

const CACHE_NAME = 'aj-trades-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - network-first for everything (finance data must be live)
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests and auth - always go to network
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // For static assets (icons, fonts), use cache-first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.includes('/_next/static/')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          // Cache the new response
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For everything else, use network-first (data must be fresh)
  event.respondWith(
    fetch(event.request).catch(() => {
      // If offline and we have a cached version, use it
      return caches.match(event.request);
    })
  );
});
