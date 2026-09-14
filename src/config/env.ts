import { z } from "zod";

/**
 * Application environment configuration & schema validation
 */
const DEFAULT_SECRET = "super_secret_jwt_signing_key_for_trounce_local_dev_12345";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/trounce"),
  MONGODB_DB_NAME: z.string().default("trounce"),
  SESSION_SECRET: z.string().min(16).default(DEFAULT_SECRET),
  ADMIN_INITIAL_PASSWORD: z.string().default("ChangeMe123!"),
  ADMIN_EMAIL: z.string().default("admin@trounce.edu"),
  WHISPER_SIDECAR_URL: z.string().default("http://127.0.0.1:8765"),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  if (process.env.NODE_ENV === "production") {
    throw new Error("Fatal: Invalid environment configuration in production");
  }
}

// In production, prohibit the known default development JWT signing secret
if (process.env.NODE_ENV === "production") {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || secret === DEFAULT_SECRET || secret.length < 32) {
    throw new Error(
      "Fatal Security Guard: SESSION_SECRET must be at least 32 characters and cannot use default dev secret in production.",
    );
  }
}

const rawEnv = parsed.success ? parsed.data : envSchema.parse({});

export interface Env {
  NODE_ENV: "development" | "production" | "test";
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  SESSION_SECRET: string;
  ADMIN_INITIAL_PASSWORD: string;
  ADMIN_EMAIL: string;
  WHISPER_SIDECAR_URL: string;
  RATE_LIMIT_ENABLED: boolean;
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
  WHISPER_SIDECAR_URL: rawEnv.WHISPER_SIDECAR_URL,
  RATE_LIMIT_ENABLED: Boolean(rawEnv.RATE_LIMIT_ENABLED),
  IS_PROD: rawEnv.NODE_ENV === "production",
  IS_DEV: rawEnv.NODE_ENV !== "production",
};
