
const CACHE_NAME = 'melody-match-offline-v3';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 1. Install Phase: Cache the "skeleton" of the app immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// 2. Activate Phase: Clean up old versions of the cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim(); // Take control of all clients immediately
});

// 3. Fetch Phase: The "Offline Magic"
self.addEventListener('fetch', (event) => {
  // Ignore API calls or non-GET requests (though this app has no API calls)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // A. If found in cache, return it (Offline Mode)
      if (cachedResponse) {
        return cachedResponse;
      }

      // B. If not in cache, fetch from internet
      return fetch(event.request)
        .then((networkResponse) => {
          // Check if valid response
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
            return networkResponse;
          }

          // C. CLONE and SAVE to cache for next time
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(event.request, responseToCache);
            } catch (err) {
              // Quota exceeded or other error, safe to ignore
            }
          });

          return networkResponse;
        })
        .catch(() => {
          // D. Network failed (Offline) and not in cache?
          // For a SPA, we usually return index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
