import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server-core";

/**
 * Isolates the test run. Everything is set explicitly so that no value from a developer's .env file
 * or shell can leak in: tests use a throwaway database and a temporary audio folder, and they make
 * no calls to external speech services.
 */
export default async function setup() {
  const mongod = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  const audioDir = mkdtempSync(path.join(tmpdir(), "trounce-test-audio-"));

  Object.assign(process.env, {
    NODE_ENV: "test",
    MONGODB_URI: mongod.getUri(),
    MONGODB_DB_NAME: "trounce_test",
    AUDIO_STORAGE_DIR: audioDir,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ADMIN_EMAIL: "admin@example.test",
    ADMIN_INITIAL_PASSWORD: `test-admin-${randomBytes(8).toString("hex")}`,
    WHISPER_SIDECAR_URL: "http://127.0.0.1:1",
    WHISPER_SIDECAR_TOKEN: "",
    GEMINI_API_KEY: "",
    OPENAI_API_KEY: "",
    RATE_LIMIT_ENABLED: "true",
  });

  return async () => {
    await mongod.stop();
    rmSync(audioDir, { recursive: true, force: true });
  };
}
