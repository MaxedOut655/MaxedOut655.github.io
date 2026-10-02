const CACHE_VERSION = 'v5';
const CACHE_NAME = `crj200-manual-${CACHE_VERSION}`;

const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/tree.js',
  '/js/viewer.js',
  '/js/search.js',
  '/js/data.js'
];

// Install: cache core files
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache only same-origin files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🚫 Do not cache external PDFs / iframes
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});
