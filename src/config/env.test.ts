import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isWeakSessionSecret } from "./env";

describe("isWeakSessionSecret", () => {
  it("accepts a long random value", () => {
    const randomSecret = randomBytes(32).toString("hex");
    expect(isWeakSessionSecret(randomSecret)).toBe(false);
  });

  it("rejects missing and short values", () => {
    expect(isWeakSessionSecret("")).toBe(true);
    expect(isWeakSessionSecret("short-secret")).toBe(true);
  });

  it("rejects values derived from the development default", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/config/env.ts", "utf8"),
    );
    const known = /DEFAULT_SECRET = "([^"]+)"/.exec(source)![1];

    expect(isWeakSessionSecret(known)).toBe(true);
    expect(isWeakSessionSecret(known.slice(0, -6))).toBe(true);
    expect(isWeakSessionSecret(known.toUpperCase())).toBe(true);
    expect(isWeakSessionSecret(`${known}-changed`)).toBe(true);
    expect(isWeakSessionSecret(`prefix-${known.slice(0, 30)}-suffix-value`)).toBe(true);
  });

  it("rejects long values with almost no variety", () => {
    expect(isWeakSessionSecret("a".repeat(64))).toBe(true);
    expect(isWeakSessionSecret("abcabcabc".repeat(8))).toBe(true);
  });
});

describe("Production startup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses to start with a weak secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "long-enough-to-parse-but-weak".slice(0, 24));
    vi.resetModules();
    await expect(import("./env")).rejects.toThrow(/Fatal Security Guard/);
  });

  it("starts with a strong secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", randomBytes(32).toString("hex"));
    vi.resetModules();
    await expect(import("./env")).resolves.toBeDefined();
  });
});
