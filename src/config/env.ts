import { z } from "zod";

/**
 * Application environment configuration & schema validation
 */
const DEFAULT_SECRET = "super_secret_jwt_signing_key_for_trounce_local_dev_12345";

/** Used only when ADMIN_EMAIL is not configured, so existing deployments keep working. */
const FALLBACK_MASTER_ADMIN_EMAIL = "shadanmd566@gmail.com";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/trounce"),
  MONGODB_DB_NAME: z.string().default("trounce"),
  SESSION_SECRET: z.string().min(16).default(DEFAULT_SECRET),
  ADMIN_INITIAL_PASSWORD: z.string().default(""),
  ADMIN_EMAIL: z.string().default(""),
  WHISPER_SIDECAR_URL: z.string().default("http://127.0.0.1:8765"),
  WHISPER_SIDECAR_TOKEN: z.string().default(""),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  /**
   * Number of reverse proxies in front of the app, used to find the real client IP in
   * X-Forwarded-For. Render, Koyeb, Fly and nginx add one hop. Use 0 if the app faces the
   * internet directly, otherwise clients could spoof their IP.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Only field names and rule messages are logged, never the values.
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Fatal: Invalid environment configuration in production");
  }
}

/**
 * A session secret that is short, or that resembles the development default printed in this file,
 * can be guessed by anyone who can read the source. They could then forge a session for any account.
 */
export function isWeakSessionSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  const knownDefault = DEFAULT_SECRET.toLowerCase();
  return (
    normalized.length < 32 ||
    knownDefault.includes(normalized) ||
    normalized.includes(knownDefault.slice(0, 16)) ||
    new Set(normalized).size < 8
  );
}

// In production, refuse to start with a guessable JWT signing secret
if (
  process.env.NODE_ENV === "production" &&
  isWeakSessionSecret(process.env.SESSION_SECRET || "")
) {
  throw new Error(
    "Fatal Security Guard: SESSION_SECRET must be a random value of at least 32 characters and must not resemble the development default. Generate one with: openssl rand -base64 48",
  );
}

const rawEnv = parsed.success ? parsed.data : envSchema.parse({});

export interface Env {
  NODE_ENV: "development" | "production" | "test";
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  SESSION_SECRET: string;
  ADMIN_INITIAL_PASSWORD: string;
  ADMIN_EMAIL: string;
  MASTER_ADMIN_EMAIL: string;
  WHISPER_SIDECAR_URL: string;
  WHISPER_SIDECAR_TOKEN: string;
  RATE_LIMIT_ENABLED: boolean;
  TRUSTED_PROXY_HOPS: number;
  IS_PROD: boolean;
  IS_DEV: boolean;
}

export const env: Env = {
  NODE_ENV: rawEnv.NODE_ENV,
  MONGODB_URI: rawEnv.MONGODB_URI,
  MONGODB_DB_NAME: rawEnv.MONGODB_DB_NAME,
  SESSION_SECRET: rawEnv.SESSION_SECRET,
  ADMIN_INITIAL_PASSWORD: rawEnv.ADMIN_INITIAL_PASSWORD,
  ADMIN_EMAIL: rawEnv.ADMIN_EMAIL,
  MASTER_ADMIN_EMAIL: (rawEnv.ADMIN_EMAIL || FALLBACK_MASTER_ADMIN_EMAIL).trim().toLowerCase(),
  WHISPER_SIDECAR_URL: rawEnv.WHISPER_SIDECAR_URL,
  WHISPER_SIDECAR_TOKEN: rawEnv.WHISPER_SIDECAR_TOKEN,
  RATE_LIMIT_ENABLED: Boolean(rawEnv.RATE_LIMIT_ENABLED),
  TRUSTED_PROXY_HOPS: rawEnv.TRUSTED_PROXY_HOPS ?? (rawEnv.NODE_ENV === "production" ? 1 : 0),
  IS_PROD: rawEnv.NODE_ENV === "production",
  IS_DEV: rawEnv.NODE_ENV !== "production",
};
