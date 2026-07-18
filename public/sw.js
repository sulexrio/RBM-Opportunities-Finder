const CACHE_NAME = "opportunity-finder-v2";
const CORE_ASSETS = ["/", "/index.html", "/app.js", "/styles.css", "/data/jobs.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim()) // take control of already-open tabs immediately
  );
});

// Network-first for data (so you get fresh jobs when online), cache
// fallback for everything else (so the app still opens with last-known
// data when your connection is bad).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith("jobs.json")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for everything else too (HTML/JS/CSS) — so UI updates
  // show up immediately on next load instead of being stuck on an old
  // cached copy. Cache is only used as a fallback when offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
