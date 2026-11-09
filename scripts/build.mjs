#!/usr/bin/env node
/**
 * Production build: `npm run build`.
 *
 * Vite takes NODE_ENV from .env when the shell has not set it. A .env containing
 * NODE_ENV=development would then silently produce a development bundle, with no service worker and
 * no security headers. So it is set explicitly here, which takes priority over .env.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vite", "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NODE_ENV: "production" },
});

process.exit(result.status ?? 1);
