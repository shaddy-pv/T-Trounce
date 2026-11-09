import { describe, expect, it } from "vitest";
import { detectPlatform } from "@/features/pwa/pwa-store";
import { normalizeAudioMime } from "@/config/constants";
import { AppError, toPublicError } from "@/server/errors";
import { clientIpFromForwardedFor } from "@/server/middleware/forwarded-for";
import { cleanIndianPhoneNumber, formatPhoneDisplay } from "./phone";
import { isAdmin, isFaculty } from "./roles";
import { attemptScore, averageMetrics, countFillerWords, weakestMetric } from "./scoring";

describe("attemptScore", () => {
  it("is completion percentage when a target exists, capped at 100", () => {
    expect(attemptScore({ durationSec: 30, targetDurationSec: 60 })).toBe(50);
    expect(attemptScore({ durationSec: 90, targetDurationSec: 60 })).toBe(100);
  });

  it("falls back to the metric average for older attempts", () => {
    const metrics = { pronunciation: 90, vocabulary: 60, grammar: 60 };
    expect(attemptScore({ durationSec: 30, ...metrics })).toBe(70);
    expect(attemptScore({ durationSec: 30, targetDurationSec: 0, ...metrics })).toBe(70);
  });
});

describe("averageMetrics", () => {
  it("averages a real zero as zero", () => {
    expect(averageMetrics({ pronunciation: 0, vocabulary: 0, grammar: 0 })).toBe(0);
  });
});

describe("weakestMetric", () => {
  it("names the lowest metric", () => {
    expect(weakestMetric({ pronunciation: 40, vocabulary: 80, grammar: 80 })).toBe("Pronunciation");
    expect(weakestMetric({ pronunciation: 80, vocabulary: 40, grammar: 80 })).toBe("Vocabulary");
    expect(weakestMetric({ pronunciation: 80, vocabulary: 80, grammar: 40 })).toBe("Grammar");
  });
});

describe("countFillerWords", () => {
  it("counts fillers regardless of case or punctuation", () => {
    expect(countFillerWords("Um, I think, UH... matlab yes.")).toBe(3);
  });

  it("does not count ordinary words", () => {
    expect(countFillerWords("I really like this, actually")).toBe(0);
  });
});

describe("phone numbers", () => {
  it("adds the country code when needed", () => {
    expect(cleanIndianPhoneNumber("98765 43210")).toBe("919876543210");
    expect(cleanIndianPhoneNumber("09876543210")).toBe("919876543210");
    expect(cleanIndianPhoneNumber("+91 98765 43210")).toBe("919876543210");
    expect(cleanIndianPhoneNumber(undefined)).toBe("");
  });

  it("does not mistake a number starting with 91 for a country code", () => {
    expect(cleanIndianPhoneNumber("9123456789")).toBe("919123456789");
    expect(formatPhoneDisplay("9123456789")).toBe("+91 91234 56789");
  });
});

describe("roles", () => {
  it("recognises faculty and admins", () => {
    expect(isFaculty({ role: "teacher" })).toBe(true);
    expect(isFaculty({ role: "admin" })).toBe(true);
    expect(isFaculty({ role: "student" })).toBe(false);
    expect(isFaculty(null)).toBe(false);
    expect(isAdmin({ role: "teacher" })).toBe(false);
    expect(isAdmin({ role: "admin" })).toBe(true);
  });
});

describe("normalizeAudioMime", () => {
  it("allows audio types and strips codec parameters", () => {
    expect(normalizeAudioMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMime("AUDIO/MP4")).toBe("audio/mp4");
  });

  it("rejects everything else", () => {
    for (const mime of ["text/html", "image/svg+xml", "application/javascript", "", null]) {
      expect(normalizeAudioMime(mime)).toBeNull();
    }
  });
});

describe("clientIpFromForwardedFor", () => {
  it("counts from the right, so a forged left-hand entry is ignored", () => {
    expect(clientIpFromForwardedFor("6.6.6.6, 1.2.3.4", 1)).toBe("1.2.3.4");
    expect(clientIpFromForwardedFor("6.6.6.6, 1.2.3.4, 10.0.0.1", 2)).toBe("1.2.3.4");
  });

  it("ignores the header entirely when no proxy is trusted", () => {
    expect(clientIpFromForwardedFor("6.6.6.6", 0)).toBeUndefined();
    expect(clientIpFromForwardedFor(undefined, 1)).toBeUndefined();
  });
});

describe("toPublicError", () => {
  it("passes through errors written for users", () => {
    const err = new AppError("Invalid email or password", 401);
    expect(toPublicError(err)).toBe(err);
  });

  it("hides internal details", () => {
    const original = console.error;
    console.error = () => {};
    try {
      const result = toPublicError(new Error("E11000 duplicate key: trounce.users")) as AppError;
      expect(result.message).not.toContain("E11000");
      expect(result.message).toBe("Something went wrong. Please try again.");
    } finally {
      console.error = original;
    }
  });

  it("does not interfere with router redirects", () => {
    const redirect = new Response(null, { status: 302 });
    expect(toPublicError(redirect)).toBe(redirect);
    const notFound = { isNotFound: true };
    expect(toPublicError(notFound)).toBe(notFound);
  });
});

describe("detectPlatform", () => {
  const cases: [string, string, number, string][] = [
    [
      "iPhone Safari",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      5,
      "ios",
    ],
    [
      "iPadOS, which reports itself as a Mac",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      5,
      "ios",
    ],
    [
      "Android Chrome",
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
      5,
      "android",
    ],
    [
      "Mac Safari",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      0,
      "mac-safari",
    ],
    [
      "Windows Chrome",
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      0,
      "desktop-chromium",
    ],
    [
      "Windows Edge",
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0",
      0,
      "desktop-chromium",
    ],
    [
      "Windows Firefox",
      "Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0",
      0,
      "unsupported",
    ],
  ];

  it.each(cases)("%s", (_name, userAgent, touchPoints, expected) => {
    expect(detectPlatform(userAgent, touchPoints)).toBe(expected);
  });
});
