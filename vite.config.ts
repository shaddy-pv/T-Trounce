import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

function devAudioStreamingPlugin(): Plugin {
  return {
    name: "dev-audio-streaming",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (url.startsWith("/api/audio/")) {
          const audioId = url.replace("/api/audio/", "").split("?")[0].trim();
          if (audioId) {
            const storageDir = path.resolve(process.cwd(), ".storage", "audio");
            const localFilePath = path.join(storageDir, `${audioId}.bin`);

            if (fs.existsSync(localFilePath)) {
              const buffer = fs.readFileSync(localFilePath);
              const totalSize = buffer.length;
              const range = req.headers.range;

              res.setHeader("Content-Type", "audio/webm");
              res.setHeader("Accept-Ranges", "bytes");
              res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

              if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10) || 0;
                const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

                if (start >= totalSize || end >= totalSize) {
                  res.statusCode = 416;
                  res.setHeader("Content-Range", `bytes */${totalSize}`);
                  res.end();
                  return;
                }

                res.statusCode = 206;
                res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
                res.setHeader("Content-Length", String(end - start + 1));
                res.end(buffer.subarray(start, end + 1));
                return;
              }

              res.statusCode = 200;
              res.setHeader("Content-Length", String(totalSize));
              res.end(buffer);
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    devAudioStreamingPlugin(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
