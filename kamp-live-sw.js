const CACHE_NAME = "samnanger-live-v1";
const APP_SHELL = [
  "./kamp-live.html?app=1",
  "./kamp-live.css?v=20260817-2",
  "./kamp-live.js?v=20260817-2",
  "./samnanger-live-manifest.json",
  "./samnanger-live-icon-180.png",
  "./samnanger-live-icon-192.png",
  "./samnanger-live-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return caches.match("./kamp-live.html?app=1");
        }
        return Response.error();
      })
  );
});
