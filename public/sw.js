// Trounce Teacher Console — Progressive Web App Service Worker
const CACHE_NAME = "trounce-pwa-v3";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

// Install: Cache essential assets & offline shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(PRECACHE_ASSETS.map((url) => new Request(url, { cache: "reload" }))),
      )
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Precache note:", err);
      }),
  );
});

// Activate: Clean up old cache versions & claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: Smart caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 1. Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // 2. Ignore non-http/https (e.g. chrome-extension:)
  if (!request.url.startsWith("http://") && !request.url.startsWith("https://")) {
    return;
  }

  const url = new URL(request.url);

  // 3. DO NOT intercept API calls, server functions, audio streams, or websockets
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("_server") ||
    url.searchParams.has("_serverFnId") ||
    url.searchParams.has("_server")
  ) {
    return; // Let browser network handle naturally without SW
  }

  // 4. Navigation requests: Network-first with offline.html fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const cachedOffline = await cache.match(OFFLINE_URL);
          if (cachedOffline) return cachedOffline;
        } catch {
          // fallback below
        }
        return new Response(
          "<!DOCTYPE html><html><head><title>Offline</title></head><body style='font-family:sans-serif;padding:2rem;text-align:center;'><h2>You are offline</h2><p>Please check your internet connection.</p></body></html>",
          {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      }),
    );
    return;
  }

  // 5. Static assets (JS chunks, CSS, Icons, Fonts): Stale-While-Revalidate with guaranteed Response
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    /\.(js|css|woff2|woff|ttf|png|svg|ico|webmanifest)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);

        // Fetch in background to update cache
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => null);

        // If we have a cached response, return it immediately
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise wait for network response
        const networkResponse = await fetchPromise;
        if (networkResponse) {
          return networkResponse;
        }

        // If network failed and nothing in cache, return a valid fallback Response object (never undefined)
        return new Response("", { status: 408, statusText: "Request Timed Out" });
      })(),
    );
    return;
  }

  // 6. For all other requests, DO NOT call event.respondWith!
  // Allowing other requests to pass through untouched prevents "Failed to convert value to 'Response'" errors.
});

// Message listener to trigger instant update
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
