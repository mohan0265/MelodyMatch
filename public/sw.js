
const CACHE_NAME = 'melody-match-offline-v5';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn-icons-png.flaticon.com/512/461/461238.png'
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

// 3. Fetch Phase: The "Smart Offline" Strategy
self.addEventListener('fetch', (event) => {
  // Ignore API calls or non-GET requests
  if (event.request.method !== 'GET') return;

  // STRATEGY A: HTML/Navigation (Network First, Fallback to Cache)
  // This ensures the user always sees the *latest* version of the app shell (index.html)
  // if they have an internet connection.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // If offline, return the cached index.html
          return caches.match('/index.html');
        })
    );
    return;
  }

  // STRATEGY B: Assets (JS, CSS, Images) (Cache First, Fallback to Network)
  // These files usually have hash names (e.g., main.a1b2c.js), so if the name changes,
  // it's a new file anyway. We want these to load instantly.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Return cached file if found
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Else fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
            return networkResponse;
          }

          // 3. Cache the new file
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(event.request, responseToCache);
            } catch (err) {
              // Ignore quota errors
            }
          });

          return networkResponse;
        })
        .catch(() => {
           // Fallback for offline images (optional)
        });
    })
  );
});
