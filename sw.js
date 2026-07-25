const CACHE_NAME = 'ascii-vision-v5';
const ASSETS = [
  '/Askii_camera/',
  '/Askii_camera/index.html',
  '/Askii_camera/style.css',
  '/Askii_camera/main.js',
  '/Askii_camera/asciiEngine.js',
  '/Askii_camera/cameraManager.js',
  '/Askii_camera/exporter.js',
  '/Askii_camera/manifest.json',
  '/Askii_camera/icon.svg',
  '/Askii_camera/pwa-192x192.png',
  '/Askii_camera/pwa-512x512.png',
  '/Askii_camera/apple-touch-icon.png'
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
