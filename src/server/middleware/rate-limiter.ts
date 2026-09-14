/**
 * In-Memory Sliding Window Rate Limiter
 * ----------------------------------------------------
 * High-performance, zero-cost rate limiting that does not require
 * an external paid Redis instance. Fully self-contained.
 */

interface RateLimitRecord {
  timestamps: number[];
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run periodic garbage collection every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );

    // Unref so it doesn't hold the Node process open on exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check whether a client (identified by key) has exceeded maxRequests within windowMs
   */
  public check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetTimeMs: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

    // Filter out timestamps outside the active sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= maxRequests) {
      const oldestTimestamp = record.timestamps[0];
      const resetTimeMs = oldestTimestamp + windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Math.max(0, resetTimeMs),
      };
    }

    // Record this request
    record.timestamps.push(now);
    const remaining = maxRequests - record.timestamps.length;

    return {
      allowed: true,
      remaining,
      resetTimeMs: windowMs,
    };
  }

  /**
   * Remove expired keys to free memory
   */
  private cleanup() {
    const now = Date.now();
    // Default 15 minute TTL for inactive records
    const ttl = 15 * 60 * 1000;
    for (const [key, record] of this.store.entries()) {
      if (
        record.timestamps.length === 0 ||
        record.timestamps[record.timestamps.length - 1] < now - ttl
      ) {
        this.store.delete(key);
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  keyPrefix?: string;
  maxRequests: number;
  windowMs: number;
  errorMessage?: string;
}

/**
 * Enforces rate limiting on an action by IP or identifier.
 * Throws an Error with 429 status code if limit exceeded.
 */
export function enforceRateLimit(identifier: string, options: RateLimitOptions): void {
  const fullKey = `${options.keyPrefix || "rl"}:${identifier}`;
  const result = rateLimiter.check(fullKey, options.maxRequests, options.windowMs);

  if (!result.allowed) {
    const waitSeconds = Math.ceil(result.resetTimeMs / 1000);
    const message =
      options.errorMessage ||
      `Too many requests. Please try again in ${waitSeconds} second${waitSeconds === 1 ? "" : "s"}.`;
    const err = new Error(message);
    (err as unknown as { statusCode: number }).statusCode = 429;
    throw err;
  }
}
