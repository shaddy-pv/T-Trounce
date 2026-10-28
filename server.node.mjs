// server.node.mjs — Production HTTP server for Tarang (TanStack Start)
// Wraps the Nitro Fetch-API handler + serves static client assets
// Usage: node server.node.mjs

import { createServer } from "node:http";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = resolve(__dirname, "dist", "client");
const PUBLIC_DIR = resolve(__dirname, "public");

// MIME type map for static assets
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function serveStatic(filePath, res, immutable = false) {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const stat = statSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400",
  );
  createReadStream(filePath).pipe(res);
  return true;
}

// Load the built TanStack Start / Nitro fetch handler
const { default: handler } = await import("./dist/server/server.js");

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";

const server = createServer((req, res) => {
  const urlPath = req.url?.split("?")[0] || "/";

  // 1. Serve hashed client assets (JS/CSS bundles) — immutable cache
  if (urlPath.startsWith("/assets/")) {
    const filePath = join(CLIENT_DIR, urlPath);
    if (existsSync(filePath) && !statSync(filePath).isDirectory()) {
      return serveStatic(filePath, res, true);
    }
  }

  // 2. Serve icons, manifest, sw.js from dist/client or public
  const publicPaths = [
    "/icons/",
    "/manifest.webmanifest",
    "/sw.js",
    "/offline.html",
    "/favicon.ico",
  ];
  if (publicPaths.some((p) => urlPath.startsWith(p) || urlPath === p)) {
    const inClient = join(CLIENT_DIR, urlPath);
    const inPublic = join(PUBLIC_DIR, urlPath);
    const filePath = existsSync(inClient) ? inClient : existsSync(inPublic) ? inPublic : null;
    if (filePath && !statSync(filePath).isDirectory()) {
      return serveStatic(filePath, res, false);
    }
  }

  // 3. All other requests → TanStack Start SSR fetch handler
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const proto = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
      const host = req.headers.host || `localhost:${PORT}`;
      const url = `${proto}://${host}${req.url}`;

      const body =
        chunks.length > 0 && req.method !== "GET" && req.method !== "HEAD"
          ? Buffer.concat(chunks)
          : undefined;

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val != null) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
      }

      const request = new Request(url, {
        method: req.method,
        headers,
        body: body?.length ? body : undefined,
      });

      const response = await handler.fetch(request, process.env, {});

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "transfer-encoding") {
          res.setHeader(key, value);
        }
      });

      if (!response.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(response.body);
      await pipeline(nodeStream, res);
    } catch (err) {
      console.error("[Tarang] Request error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  req.on("error", (err) => {
    console.error("[Tarang] Request stream error:", err);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n🎵 Tarang server running on http://${HOST}:${PORT}\n`);
});

server.on("error", (err) => {
  console.error("[Tarang] Server error:", err);
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`\n[Tarang] ${signal} — shutting down...`);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
