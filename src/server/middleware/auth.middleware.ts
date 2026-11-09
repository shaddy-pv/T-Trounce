import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { isAdmin, isFaculty } from "@/lib/roles";
import { forbidden, unauthorized } from "../errors";
import { AuthService, type SessionPayload } from "../services/auth.service";

export const COOKIE_NAME = "trounce_session";
export const LEGACY_COOKIE_NAME = "tarang_session";

/** Reads the session token from the request cookies. */
export const readSessionCookie = createServerOnlyFn(
  (): string | undefined => getCookie(COOKIE_NAME) || getCookie(LEGACY_COOKIE_NAME),
);

/**
 * Verifies the session cookie, confirms the account still exists, and adds the user to context.
 */
export const authenticatedMiddleware = createMiddleware().server(async ({ next }) => {
  const token = readSessionCookie();
  if (!token) throw unauthorized("Please sign in to perform this action.");

  const user = await AuthService.resolveSession(token);
  if (!user) throw unauthorized("Your session has expired. Please sign in again.");

  return await next({ context: { user } });
});

/**
 * Requires the user to be a teacher or administrator.
 */
export const teacherOnlyMiddleware = createMiddleware()
  .middleware([authenticatedMiddleware])
  .server(async ({ next, context }) => {
    const user = (context as { user: SessionPayload }).user;
    if (!isFaculty(user)) {
      throw forbidden("This action requires faculty or administrator permissions.");
    }
    return await next({ context: { user } });
  });

/**
 * Requires the user to be an administrator.
 */
export const adminOnlyMiddleware = createMiddleware()
  .middleware([authenticatedMiddleware])
  .server(async ({ next, context }) => {
    const user = (context as { user: SessionPayload }).user;
    if (!isAdmin(user)) {
      throw forbidden("This action requires administrator permissions.");
    }
    return await next({ context: { user } });
  });
