// Sxltx Atelier Cache Busting & Self-Unregister Worker v6
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map(k => caches.delete(k)));
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Direct network pass-through without any cache interception
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
