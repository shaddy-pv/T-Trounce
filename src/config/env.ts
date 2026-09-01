import { z } from "zod";

/**
 * Application environment configuration & schema validation
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/tarang"),
  MONGODB_DB_NAME: z.string().default("tarang"),
  SESSION_SECRET: z
    .string()
    .min(16)
    .default("super_secret_jwt_signing_key_for_tarang_local_dev_12345"),
  ADMIN_INITIAL_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  if (process.env.NODE_ENV === "production") {
    throw new Error("Fatal: Invalid environment configuration in production");
  }
}

const rawEnv = parsed.success ? parsed.data : envSchema.parse({});

export interface Env {
  NODE_ENV: "development" | "production" | "test";
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  SESSION_SECRET: string;
  ADMIN_INITIAL_PASSWORD?: string;
  IS_PROD: boolean;
  IS_DEV: boolean;
}

export const env: Env = {
  NODE_ENV: rawEnv.NODE_ENV,
  MONGODB_URI: rawEnv.MONGODB_URI,
  MONGODB_DB_NAME: rawEnv.MONGODB_DB_NAME,
  SESSION_SECRET: rawEnv.SESSION_SECRET,
  ADMIN_INITIAL_PASSWORD: rawEnv.ADMIN_INITIAL_PASSWORD,
  IS_PROD: rawEnv.NODE_ENV === "production",
  IS_DEV: rawEnv.NODE_ENV !== "production",
};
