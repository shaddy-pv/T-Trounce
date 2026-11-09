import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { toPublicError } from "./server/errors";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Pass through TanStack Router redirects (Response objects with 3xx status)
    // and any error that already carries an HTTP status code
    if (error instanceof Response) {
      throw error;
    }
    if (
      error != null &&
      typeof error === "object" &&
      ("statusCode" in error || "status" in error)
    ) {
      throw error;
    }
    console.error("[start.ts errorMiddleware]", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Protect all server function endpoints from cross-site request forgery
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Only errors written for users reach the browser. Anything unexpected, such as a database driver
// error, is logged in full here and replaced with a generic message.
const publicErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    throw toPublicError(error);
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
  functionMiddleware: [publicErrorMiddleware],
}));
