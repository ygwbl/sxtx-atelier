// Sxtx Atelier Cache Busting & Auto-Purging Worker v5
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Direct network pass-through: NEVER cache stale assets
  event.respondWith(fetch(event.request));
});
