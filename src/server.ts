import "./lib/error-capture";

import { Readable } from "stream";
import { UPLOAD_LIMITS } from "./config/constants";
import { AUDIO_RESPONSE_HEADERS, SECURITY_HEADERS } from "./config/security-headers";
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
  // Always pass through redirects (3xx) and non-error responses
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  console.error("[server.ts] h3 swallowed SSR error:", captured ?? body);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

/**
 * Serves a recording to the student who made it, or to a teacher or admin. Everyone else gets the
 * same 404, so a valid ID cannot be told apart from an invalid one.
 */
async function handleAudioRequest(request: Request, audioId: string): Promise<Response> {
  const notFound = () =>
    new Response("Audio file not found.", {
      status: 404,
      headers: { ...AUDIO_RESPONSE_HEADERS, "Cache-Control": "no-store" },
    });

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const [{ AuthService }, { StorageService, isValidAudioId }, { getDb }, { isFaculty }] =
    await Promise.all([
      import("./server/services/auth.service"),
      import("./server/services/storage.service"),
      import("./server/db/client"),
      import("./lib/roles"),
    ]);

  if (!isValidAudioId(audioId)) return notFound();

  const token = readCookie(request, "trounce_session") || readCookie(request, "tarang_session");
  const user = await AuthService.resolveSession(token);
  if (!user) {
    return new Response("Please sign in to listen to this recording.", {
      status: 401,
      headers: { ...AUDIO_RESPONSE_HEADERS, "Cache-Control": "no-store" },
    });
  }

  if (!isFaculty(user)) {
    const db = await getDb();
    if (!db) {
      return new Response("Service temporarily unavailable.", {
        status: 503,
        headers: { "Retry-After": "5", "Cache-Control": "no-store" },
      });
    }
    const owned = await db.collection("attempts").findOne(
      {
        audioId,
        studentId: { $in: [user.userId, user.email].filter(Boolean) },
      },
      { projection: { _id: 1 } },
    );
    if (!owned) return notFound();
  }

  const audio = await StorageService.getAudioStream(
    audioId,
    request.headers.get("range") ?? undefined,
  );
  if (!audio) return notFound();

  const headers = new Headers({
    ...AUDIO_RESPONSE_HEADERS,
    "Content-Type": audio.contentType,
    "Content-Length": String(audio.contentLength),
    "Accept-Ranges": audio.acceptRanges,
    // Private: this response depends on who is asking, so shared caches must never store it.
    "Cache-Control": "private, max-age=3600",
    Vary: "Cookie",
  });
  if (audio.contentRange) headers.set("Content-Range", audio.contentRange);

  if (request.method === "HEAD" || audio.status === 416) {
    return new Response(null, { status: audio.status, headers });
  }

  const body = audio.open();
  return new Response(
    Buffer.isBuffer(body) ? new Uint8Array(body) : (Readable.toWeb(body) as ReadableStream),
    { status: audio.status, headers },
  );
}

/** For uptime monitors and platform health checks. Reveals nothing beyond up or down. */
async function handleHealthRequest(): Promise<Response> {
  const { getDb } = await import("./server/db/client");
  let database = false;
  try {
    const db = await getDb();
    if (db) {
      await db.command({ ping: 1 });
      database = true;
    }
  } catch {
    database = false;
  }
  return new Response(JSON.stringify({ status: database ? "ok" : "degraded", database }), {
    status: database ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Reads and discards a rejected body, without buffering it. If the server replied without reading
 * it, the connection would reset and the client would see a network error instead of the 413. Past
 * the cap the connection is simply dropped, so this can't be used to tie up the server indefinitely.
 */
async function discardBody(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  let discarded = 0;
  try {
    while (discarded < UPLOAD_LIMITS.maxRequestBytes * 4) {
      const { done, value } = await reader.read();
      if (done) return;
      discarded += value.byteLength;
    }
    await reader.cancel();
  } catch {
    // The client went away, which is fine.
  }
}

/**
 * Rejects oversized bodies before they are read into memory. Requests that declare no length are
 * counted as they stream in, and fail as soon as they pass the limit.
 */
async function enforceBodyLimit(request: Request): Promise<Request | Response> {
  if (!request.body) return request;

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (Number(declared) <= UPLOAD_LIMITS.maxRequestBytes) return request;
    await discardBody(request.body);
    return new Response("Request too large.", {
      status: 413,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let received = 0;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > UPLOAD_LIMITS.maxRequestBytes) {
          controller.error(new Error("Request too large"));
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );
  return new Request(request, { body: counted, duplex: "half" } as RequestInit);
}

function withSecurityHeaders(response: Response): Response {
  // Vite's dev server relies on inline scripts and sockets, so these only apply to production builds.
  if (!import.meta.env.PROD) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function route(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/api/audio/")) {
    return handleAudioRequest(request, pathname.slice("/api/audio/".length));
  }
  if (pathname === "/api/health") {
    return handleHealthRequest();
  }

  const checked = pathname.startsWith("/_serverFn/") ? await enforceBodyLimit(request) : request;
  if (checked instanceof Response) return checked;

  const handler = await getServerEntry();
  const response = await handler.fetch(checked, env, ctx);
  return normalizeCatastrophicSsrResponse(response);
}

export default {
  /** Used by scripts/serve.mjs to apply the same headers to static files. */
  securityHeaders: SECURITY_HEADERS,

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      return withSecurityHeaders(await route(request, env, ctx));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
