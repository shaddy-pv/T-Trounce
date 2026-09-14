import { describe, it, expect, beforeEach } from "vitest";
import { rateLimiter, enforceRateLimit } from "./rate-limiter";

describe("Rate Limiter Middleware", () => {
  it("allows requests within threshold limit", () => {
    const key = `test-user-${Date.now()}`;
    const result1 = rateLimiter.check(key, 3, 1000);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = rateLimiter.check(key, 3, 1000);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = rateLimiter.check(key, 3, 1000);
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  it("blocks requests exceeding threshold limit", () => {
    const key = `test-blocked-${Date.now()}`;
    // Exhaust 2 allowed requests
    rateLimiter.check(key, 2, 5000);
    rateLimiter.check(key, 2, 5000);

    const blockedResult = rateLimiter.check(key, 2, 5000);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remaining).toBe(0);
    expect(blockedResult.resetTimeMs).toBeGreaterThan(0);
  });

  it("enforceRateLimit throws 429 error when exceeded", () => {
    const key = `test-enforce-${Date.now()}`;
    const opts = { keyPrefix: "test", maxRequests: 1, windowMs: 2000 };

    // First request passes
    expect(() => enforceRateLimit(key, opts)).not.toThrow();

    // Second request throws 429
    expect(() => enforceRateLimit(key, opts)).toThrowError(/Too many requests/);
  });
});
