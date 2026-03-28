const CACHE_VERSION = "2026-03-28-2";
const CACHE_NAME = `nn-pwa-${CACHE_VERSION}`;
const CORE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./cms.json",
  "./admin.html",
  "./admin.js",
  "./manifest.webmanifest",
  "./logo.svg",
  "./icon.svg",
  "./icon-maskable.svg"
];

const isSameOrigin = (request) => {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
};

const isNavigation = (request) => request.mode === "navigate";

const normalizeCacheKey = (request) => {
  if (!isSameOrigin(request)) return request;
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET", headers: request.headers, credentials: "same-origin" });
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("nn-pwa-") && k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!request || request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const sameOrigin = isSameOrigin(request);
      const url = sameOrigin ? new URL(request.url) : null;

      if (isNavigation(request)) {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(normalizeCacheKey(request), res.clone());
          return res;
        } catch {
          const cached = await caches.match("./index.html");
          return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      }

      if (sameOrigin && url && url.pathname.endsWith("/cms.json")) {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(normalizeCacheKey(request), res.clone());
          return res;
        } catch {
          const cached = await caches.match(normalizeCacheKey(request));
          return cached || fetch(request);
        }
      }

      if (sameOrigin) {
        const cached = await caches.match(normalizeCacheKey(request), { ignoreSearch: true });
        if (cached) return cached;
        const res = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(normalizeCacheKey(request), res.clone());
        return res;
      }

      return fetch(request);
    })()
  );
});
