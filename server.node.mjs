// server.node.mjs — Production HTTP server for Tarang (TanStack Start)
// Wraps the Nitro Fetch-API handler in a native Node.js HTTP server
// Usage: node server.node.mjs

import { createServer } from "node:http";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

// Load the built TanStack Start / Nitro fetch handler
const { default: handler } = await import("./dist/server/server.js");

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "0.0.0.0";

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const proto =
        req.headers["x-forwarded-proto"] ||
        (req.socket?.encrypted ? "https" : "http");
      const host = req.headers.host || `localhost:${PORT}`;
      const url = `${proto}://${host}${req.url}`;

      const body =
        chunks.length > 0 && req.method !== "GET" && req.method !== "HEAD"
          ? Buffer.concat(chunks)
          : undefined;

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val != null)
          headers.set(key, Array.isArray(val) ? val.join(", ") : val);
      }

      const request = new Request(url, {
        method: req.method,
        headers,
        body: body?.length ? body : undefined,
      });

      const response = await handler.fetch(request, process.env, {});

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        // Skip headers that Node sets automatically
        if (key.toLowerCase() !== "transfer-encoding") {
          res.setHeader(key, value);
        }
      });

      if (!response.body) {
        res.end();
        return;
      }

      // Stream the response — important for large audio files
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

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n[Tarang] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log("[Tarang] Server closed.");
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
