import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // 1. Direct Persistent Audio Streaming Endpoint (/api/audio/:audioId)
      if (url.pathname.startsWith("/api/audio/")) {
        const audioId = url.pathname.replace("/api/audio/", "").trim();
        if (audioId) {
          const { StorageService } = await import("./server/services/storage.service");
          const rangeHeader = request.headers.get("range") || undefined;
          const streamRes = await StorageService.getAudioStream(audioId, rangeHeader);

          if (!streamRes) {
            return new Response("Audio file not found or expired.", { status: 404 });
          }

          const headers = new Headers({
            "Content-Type": streamRes.contentType,
            "Content-Length": String(streamRes.contentLength),
            "Accept-Ranges": streamRes.acceptRanges,
            "Cache-Control": "public, max-age=31536000, immutable",
          });

          if (streamRes.contentRange) {
            headers.set("Content-Range", streamRes.contentRange);
          }

          const body = Buffer.isBuffer(streamRes.stream)
            ? new Uint8Array(streamRes.stream)
            : (streamRes.stream as unknown as BodyInit);

          return new Response(body, {
            status: streamRes.status,
            headers,
          });
        }
      }

      // 2. SSR Application Handler
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
