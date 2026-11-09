/**
 * Errors whose message is safe to show to the user.
 *
 * Anything thrown from a server function that is not an AppError is treated as a bug or an
 * infrastructure failure: it is logged in full on the server and the client receives a generic
 * message, so driver errors, collection names and similar internals never reach the browser.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export const unauthorized = (message = "Please sign in to continue.") =>
  new AppError(`Unauthorized: ${message}`, 401);

export const forbidden = (message = "You do not have permission to do this.") =>
  new AppError(`Forbidden: ${message}`, 403);

export const notFound = (message = "This item could not be found.") => new AppError(message, 404);

export const serviceUnavailable = (
  message = "The service is temporarily unavailable. Please try again in a moment.",
) => new AppError(message, 503);

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

interface ZodLikeError {
  name: string;
  issues: { message: string; path?: PropertyKey[] }[];
}

function isZodError(err: unknown): err is ZodLikeError {
  return (
    err instanceof Error &&
    err.name === "ZodError" &&
    Array.isArray((err as unknown as ZodLikeError).issues)
  );
}

/** Router control flow (redirect / notFound) must pass through untouched. */
function isRouterControlFlow(err: unknown): boolean {
  if (err instanceof Response) return true;
  if (err == null || typeof err !== "object") return false;
  return "isNotFound" in err || ("options" in err && "status" in err);
}

/** Converts any thrown value into something safe to send to the client. */
export function toPublicError(err: unknown): unknown {
  if (err instanceof AppError || isRouterControlFlow(err)) return err;

  if (isZodError(err)) {
    return new AppError(err.issues[0]?.message ?? "Please check your input and try again.", 400);
  }

  console.error("[server] Unhandled server function error:", err);
  return new AppError(GENERIC_MESSAGE, 500);
}
