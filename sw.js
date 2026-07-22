const CACHE_NAME = 'kml-replay-v0.1.1-1';
const BASE_PATH = new URL(self.registration.scope).pathname;
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icons/icon.svg`,
  `${BASE_PATH}assets/coastline/coastlinePaths.json`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache
          .addAll(APP_SHELL)
          .then(() => fetch(BASE_PATH))
          .then((response) => response.text())
          .then((html) => {
            const buildAssets = findBuildAssets(html);
            return cache.addAll(buildAssets).then(() => removeStaleBuildAssets(cache, buildAssets));
          }),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(BASE_PATH, responseCopy);
          });
          return networkResponse;
        })
        .catch(() => caches.match(BASE_PATH)),
    );
    return;
  }

  event.respondWith(
    matchCachedRequest(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        const responseCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseCopy);
        });
        return networkResponse;
      });
    }),
  );
});

function matchCachedRequest(request) {
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }

    const url = new URL(request.url);
    return caches.match(url.pathname);
  });
}

function findBuildAssets(html) {
  const assetUrls = new Set();
  const patterns = [
    /<script[^>]+src="([^"]+)"/g,
    /<link[^>]+href="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = match[1];
      if (url && url.startsWith(`${BASE_PATH}assets/`)) {
        assetUrls.add(url);
      }
    }
  }

  return Array.from(assetUrls);
}

function removeStaleBuildAssets(cache, currentBuildAssets) {
  const currentAssetSet = new Set(currentBuildAssets);

  return cache.keys().then((requests) =>
    Promise.all(
      requests
        .filter((request) => {
          const url = new URL(request.url);
          return url.pathname.startsWith(`${BASE_PATH}assets/index-`) && !currentAssetSet.has(url.pathname);
        })
        .map((request) => cache.delete(request)),
    ),
  );
}
