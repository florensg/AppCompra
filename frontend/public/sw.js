const CACHE_NAME = "appcompras-v2";
const APP_SHELL  = ["index.html", "manifest.webmanifest"];

// Patterns that should NEVER be cached (Google OAuth & Sheets API)
const BYPASS_PATTERNS = [
  "accounts.google.com",
  "oauth2.googleapis.com",
  "sheets.googleapis.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Never intercept non-GET or auth/API calls
  if (event.request.method !== "GET") return;
  if (BYPASS_PATTERNS.some((p) => url.includes(p))) return;

  // Network-first for navigation requests (ensures fresh HTML)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Cache-first for static assets (JS bundles, icons, manifests)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Only cache successful responses for same-origin assets
        if (response.ok && (url.startsWith(self.location.origin) || url.includes("fonts.googleapis"))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match("/"));
    })
  );
});
