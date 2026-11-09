import { env } from "@/config/env";
import { AppError } from "../errors";

/**
 * In-memory sliding-window rate limiter.
 *
 * Needs no external service, but limits apply per process. If the app is scaled to several
 * instances, each enforces its own count; a shared store would be needed for a strict global limit.
 */

interface RateLimitRecord {
  timestamps: number[];
  windowMs: number;
}

const MAX_TRACKED_KEYS = 50_000;

class InMemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodic garbage collection, so inactive keys do not accumulate.
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Unref so it does not hold the Node process open on exit.
    this.cleanupInterval.unref?.();
  }

  private activeRecord(key: string, windowMs: number, now: number): RateLimitRecord {
    let record = this.store.get(key);
    if (!record) {
      if (this.store.size >= MAX_TRACKED_KEYS) this.cleanup(true);
      record = { timestamps: [], windowMs };
      this.store.set(key, record);
    }
    record.windowMs = windowMs;
    record.timestamps = record.timestamps.filter((ts) => ts > now - windowMs);
    return record;
  }

  /**
   * Records a request and reports whether it is within the limit.
   */
  public check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetTimeMs: number } {
    const now = Date.now();
    const record = this.activeRecord(key, windowMs, now);

    if (record.timestamps.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Math.max(0, record.timestamps[0] + windowMs - now),
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - record.timestamps.length,
      resetTimeMs: windowMs,
    };
  }

  /** Reports whether a key is over its limit, without counting this request. */
  public isExceeded(key: string, maxRequests: number, windowMs: number): boolean {
    return this.activeRecord(key, windowMs, Date.now()).timestamps.length >= maxRequests;
  }

  /** Counts an event against a key. Used for limits that only count failures. */
  public record(key: string, windowMs: number): void {
    const now = Date.now();
    this.activeRecord(key, windowMs, now).timestamps.push(now);
  }

  public reset(key: string): void {
    this.store.delete(key);
  }

  private cleanup(force = false) {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      const last = record.timestamps[record.timestamps.length - 1];
      if (last === undefined || last < now - record.windowMs) this.store.delete(key);
    }
    // Under a flood of unique keys, drop everything rather than grow without limit.
    if (force && this.store.size >= MAX_TRACKED_KEYS) this.store.clear();
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
 * Counts this request against the identifier, and throws a 429 error if over the limit.
 */
export function enforceRateLimit(identifier: string, options: RateLimitOptions): void {
  if (!env.RATE_LIMIT_ENABLED) return;

  const fullKey = `${options.keyPrefix || "rl"}:${identifier}`;
  const result = rateLimiter.check(fullKey, options.maxRequests, options.windowMs);

  if (!result.allowed) {
    const waitSeconds = Math.ceil(result.resetTimeMs / 1000);
    throw new AppError(
      options.errorMessage ||
        `Too many requests. Please try again in ${waitSeconds} second${waitSeconds === 1 ? "" : "s"}.`,
      429,
    );
  }
}

// ---- Login limits ------------------------------------------------------------------------------
// Coaching institutes often share one public IP, so a plain per-IP limit would block a whole class
// signing in together. Only failed attempts count toward the broader limits, and the per-account
// limit is high enough that a stranger cannot cheaply lock someone out from another address.

const MINUTE = 60 * 1000;
const LOGIN_PER_ACCOUNT_AND_IP = { max: 5, windowMs: MINUTE };
const LOGIN_FAILURES_PER_IP = { max: 60, windowMs: 15 * MINUTE };
const LOGIN_FAILURES_PER_ACCOUNT = { max: 50, windowMs: 60 * MINUTE };

const TOO_MANY_LOGINS = "Too many login attempts. Please wait a few minutes before trying again.";

export function assertLoginAllowed(email: string, ip: string): void {
  if (!env.RATE_LIMIT_ENABLED) return;

  enforceRateLimit(`${email}|${ip}`, {
    keyPrefix: "login",
    maxRequests: LOGIN_PER_ACCOUNT_AND_IP.max,
    windowMs: LOGIN_PER_ACCOUNT_AND_IP.windowMs,
    errorMessage: TOO_MANY_LOGINS,
  });

  if (
    rateLimiter.isExceeded(
      `login-fail-ip:${ip}`,
      LOGIN_FAILURES_PER_IP.max,
      LOGIN_FAILURES_PER_IP.windowMs,
    ) ||
    rateLimiter.isExceeded(
      `login-fail-account:${email}`,
      LOGIN_FAILURES_PER_ACCOUNT.max,
      LOGIN_FAILURES_PER_ACCOUNT.windowMs,
    )
  ) {
    throw new AppError(TOO_MANY_LOGINS, 429);
  }
}

export function recordLoginFailure(email: string, ip: string): void {
  rateLimiter.record(`login-fail-ip:${ip}`, LOGIN_FAILURES_PER_IP.windowMs);
  rateLimiter.record(`login-fail-account:${email}`, LOGIN_FAILURES_PER_ACCOUNT.windowMs);
}

export function recordLoginSuccess(email: string, ip: string): void {
  rateLimiter.reset(`login:${email}|${ip}`);
}
