import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Starts a real, in-memory MongoDB. Tests can never touch a database from .env.
    globalSetup: ["./tests/vitest-global-setup.ts"],
    // Test files share that database, so they run one at a time.
    fileParallelism: false,
  },
});
