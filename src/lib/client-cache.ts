/**
 * In-memory client-side cache for server function responses.
 * Provides instant 0ms responses when switching between routes on the browser.
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const clientMemoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CLIENT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Executes a fetcher with in-memory caching on the browser client.
 * Server-side (SSR) execution always executes fresh without caching.
 */
export async function cachedClientFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_CLIENT_CACHE_TTL_MS,
): Promise<T> {
  // Always execute fresh in SSR environment
  if (typeof window === "undefined") {
    return await fetcher();
  }

  const cached = clientMemoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const data = await fetcher();
  clientMemoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/**
 * Invalidates client memory cache keys matching a prefix, or clears all keys.
 */
export function invalidateClientDataCache(prefix?: string): void {
  if (!prefix) {
    clientMemoryCache.clear();
  } else {
    for (const key of clientMemoryCache.keys()) {
      if (key.startsWith(prefix)) {
        clientMemoryCache.delete(key);
      }
    }
  }
}
