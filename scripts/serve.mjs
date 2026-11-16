#!/usr/bin/env node
/**
 * Production server: `npm run build && npm start`.
 *
 * Serves the client build with the right caching and compression, and hands everything else to the
 * application in dist/server. Environment:
 *   PORT (default 3000), HOST (default 0.0.0.0)
 */
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlib, gzip } from "node:zlib";
import { serve } from "srvx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "dist", "client");
const SERVER_ENTRY = path.join(ROOT, "dist", "server", "server.js");

if (!existsSync(SERVER_ENTRY)) {
  console.error('No production build found. Run "npm run build" first.');
  process.exit(1);
}

// This server only ever runs production builds, so a stray NODE_ENV in .env must not change that.
process.env.NODE_ENV = "production";

const app = (await import(pathToFileURL(SERVER_ENTRY).href)).default;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".webmanifest",
  ".svg",
  ".map",
]);
const DYNAMIC_COMPRESSIBLE = /^(text\/html|application\/json)/;

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);

/**
 * Hashed files in /assets never change, so browsers may keep them for a year. The service worker,
 * manifest and offline page must always be revalidated, or a deployment could leave users behind.
 */
function cacheControlFor(pathname) {
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (pathname.startsWith("/icons/")) return "public, max-age=604800";
  return "no-cache";
}

/** Each static file is compressed once at high quality and then served from memory. */
const compressedCache = new Map();

async function compressedBody(filePath, encoding) {
  const key = `${encoding}:${filePath}`;
  let pending = compressedCache.get(key);
  if (!pending) {
    pending = readFile(filePath).then((raw) =>
      encoding === "br"
        ? compressBrotli(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } })
        : compressGzip(raw, { level: 9 }),
    );
    compressedCache.set(key, pending);
    pending.catch(() => compressedCache.delete(key));
  }
  return pending;
}

function preferredEncoding(request) {
  const accepted = request.headers.get("accept-encoding") ?? "";
  if (accepted.includes("br")) return "br";
  if (accepted.includes("gzip")) return "gzip";
  return null;
}

function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.endsWith("/")) return null;
  const filePath = path.join(CLIENT_DIR, decoded);
  return filePath.startsWith(CLIENT_DIR + path.sep) ? filePath : null;
}

async function serveStatic(request, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) return null;

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return null;

  const ext = path.extname(filePath).toLowerCase();
  const headers = new Headers(app.securityHeaders);
  headers.set("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
  headers.set("Cache-Control", cacheControlFor(pathname));
  headers.set("Vary", "Accept-Encoding");
  if (pathname === "/sw.js") headers.set("Service-Worker-Allowed", "/");

  const encoding = COMPRESSIBLE.has(ext) ? preferredEncoding(request) : null;
  const body = encoding ? await compressedBody(filePath, encoding) : await readFile(filePath);
  if (encoding) headers.set("Content-Encoding", encoding);
  headers.set("Content-Length", String(body.length));

  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

/** Compresses pages and API responses, which are generated per request. */
function compressDynamic(request, response) {
  const type = response.headers.get("content-type") ?? "";
  const accepted = request.headers.get("accept-encoding") ?? "";
  if (
    !response.body ||
    !accepted.includes("gzip") ||
    response.headers.has("content-encoding") ||
    !DYNAMIC_COMPRESSIBLE.test(type)
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Encoding", "gzip");
  headers.delete("Content-Length");
  headers.append("Vary", "Accept-Encoding");
  return new Response(response.body.pipeThrough(new CompressionStream("gzip")), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const server = serve({
  port: Number(process.env.PORT) || 3000,
  hostname: process.env.HOST || "0.0.0.0",
  silent: true,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await serveStatic(request, pathname);
      if (staticResponse) return staticResponse;
    }

    return compressDynamic(request, await app.fetch(request));
  },
});

await server.ready();
console.log(`Trounce listening on ${server.url}`);
