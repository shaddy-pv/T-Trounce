// Trounce service worker.
//
// What is cached, and why it is safe:
//   - Hashed build files in /assets. Their names change whenever their content changes, so they can
//     never be stale. Each deployment gets its own cache and old ones are deleted on activation.
//   - The offline page, manifest and icons. Public and contain no user data.
//   - Google Fonts files. Public and immutable.
//
// What is never cached:
//   - Pages. Navigations always go to the network, so users get current code after a deployment and
//     no page containing private data is ever stored. The offline page is only a fallback.
//   - API calls, server functions and audio. These contain private student data.
//
// __BUILD_ID__ is replaced at build time (see vite.config.ts). This changes the file's bytes on every
// deployment, which is what makes browsers install the new version.
const BUILD_ID = "__BUILD_ID__";

const STATIC_CACHE = `trounce-static-${BUILD_ID}`;
const ASSET_CACHE = `trounce-assets-${BUILD_ID}`;
const FONT_CACHE = "trounce-fonts-v1";
const MAX_FONT_ENTRIES = 30;

const OFFLINE_URL = "/offline.html";
const PRECACHE_REQUIRED = [OFFLINE_URL];
const PRECACHE_OPTIONAL = [
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // The offline page is essential: if it fails, the install fails and is retried later.
      await cache.addAll(PRECACHE_REQUIRED.map((url) => new Request(url, { cache: "reload" })));
      // A missing icon should not stop the whole install.
      await Promise.allSettled(
        PRECACHE_OPTIONAL.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
    })(),
  );
  // No skipWaiting here. An update is applied when the user accepts it or all tabs close, so a
  // student's in-progress recording is never interrupted.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([STATIC_CACHE, ASSET_CACHE, FONT_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !current.has(name)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isPrivateOrDynamic(url, request) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn") ||
    request.headers.has("x-tsr-serverFn") ||
    request.headers.has("range") ||
    request.destination === "audio" ||
    request.destination === "video"
  );
}

async function networkWithOfflineFallback(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** Serves from cache if present, otherwise fetches and stores a successful response. */
async function cacheFirst(request, cacheName, canStore) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (canStore(response)) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

/** Network first, so changes are seen promptly, with the cached copy for when offline. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((k) => cache.delete(k)),
  );
}

const isSameOriginSuccess = (response) => response.ok && response.type === "basic";
const isFontSuccess = (response) => response.ok && response.type === "cors";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (url.origin === self.location.origin) {
    if (isPrivateOrDynamic(url, request)) return;

    if (request.mode === "navigate") {
      event.respondWith(networkWithOfflineFallback(event));
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(request, ASSET_CACHE, isSameOriginSuccess));
      return;
    }
    if (
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === OFFLINE_URL
    ) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      cacheFirst(request, FONT_CACHE, isFontSuccess).then((response) => {
        event.waitUntil(trimCache(FONT_CACHE, MAX_FONT_ENTRIES));
        return response;
      }),
    );
  }
});
