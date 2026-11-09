import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Stamps the service worker with a hash of the build's file names. Each deployment produces a sw.js
 * with different bytes, which is what makes browsers install the update and drop the old caches.
 */
function serviceWorkerBuildId(): Plugin {
  return {
    name: "trounce-sw-build-id",
    apply: "build",
    async writeBundle(options, bundle) {
      if (this.environment.name !== "client" || !options.dir) return;

      const buildId = createHash("sha256")
        .update(Object.keys(bundle).sort().join("\n"))
        .digest("hex")
        .slice(0, 12);

      const swPath = path.join(options.dir, "sw.js");
      const source = await readFile(swPath, "utf8");
      if (!source.includes("__BUILD_ID__")) {
        throw new Error("public/sw.js is missing the __BUILD_ID__ placeholder");
      }
      await writeFile(swPath, source.replaceAll("__BUILD_ID__", buildId));
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      server: {
        entry: "server",
      },
    }),
    viteReact(),
    tailwindcss(),
    serviceWorkerBuildId(),
  ],
});
