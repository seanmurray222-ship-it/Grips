/* Open Grips Trainer service worker. Generated at build time from src/sw-template.js. */
const VERSION = "__VERSION__";
const CACHE = "open-grips-" + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(new URL(u, self.registration.scope), { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("open-grips-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: serve the cached shell instantly (works in airplane mode).
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(new URL("./", self.registration.scope)).then((hit) => hit || fetch(req)),
      ),
    );
    return;
  }

  // Static assets: cache first, then network (and cache what we fetch).
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") cache.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});
