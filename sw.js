const CACHE_NAME = 'ascii-vision-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './asciiEngine.js',
  './cameraManager.js',
  './exporter.js',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use catch so that one missing file doesn't block the whole cache
      return Promise.allSettled(
        ASSETS.map(asset => cache.add(asset).catch(err => console.warn('Failed to cache:', asset, err)))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(cached => cached || Response.error()))
  );
});
