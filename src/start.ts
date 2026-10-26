import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Pass through TanStack Router redirects (Response objects with 3xx status)
    // and any error that already carries an HTTP status code
    if (error instanceof Response) {
      throw error;
    }
    if (error != null && typeof error === "object" && ("statusCode" in error || "status" in error)) {
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

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
