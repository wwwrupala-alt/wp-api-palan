const CACHE_NAME = 'wabacloud-v2';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png'
];

const isDevOrPreviewHost = (hostname) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('ais-dev-') ||
  hostname.startsWith('ais-pre-');

// Install event: Precache only static PWA icons/manifest (never Vite dev modules)
self.addEventListener('install', (event) => {
  if (isDevOrPreviewHost(self.location.hostname)) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event: Delete ALL old caches (including poisoned wabacloud-v1)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (isDevOrPreviewHost(self.location.hostname) || key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      if (isDevOrPreviewHost(self.location.hostname)) {
        try {
          await self.registration.unregister();
        } catch (_) {}
      }
    })()
  );
});

// Fetch event: Never intercept Vite dev/source modules, API routes, or preview hosts
self.addEventListener('fetch', (event) => {
  if (isDevOrPreviewHost(self.location.hostname)) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET, cross-origin, API routes, or dev module paths
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // For HTML navigation requests, use network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/');
        })
    );
    return;
  }

  // Only cache static PWA assets and hashed production bundles under /assets/
  const isCacheableStatic =
    url.pathname.startsWith('/assets/') ||
    STATIC_ASSETS.includes(url.pathname);

  if (!isCacheableStatic) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
