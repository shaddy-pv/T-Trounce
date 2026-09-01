import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { AuthService, type SessionPayload } from "../services/auth.service";

export const COOKIE_NAME = "tarang_session";

/**
 * Middleware: Verifies session cookie and injects authenticated user into context.
 * Throws 401 if unauthenticated.
 */
export const authenticatedMiddleware = createMiddleware().server(async ({ next }) => {
  const token = getCookie(COOKIE_NAME);
  if (!token) {
    throw new Error("Unauthorized: Please sign in to perform this action.");
  }

  const user = await AuthService.verifySessionToken(token);
  if (!user) {
    throw new Error("Unauthorized: Invalid or expired session.");
  }

  return await next({
    context: {
      user,
    },
  });
});

/**
 * Middleware: Requires the user to be a Teacher or Admin.
 * Throws 403 if user is a Student.
 */
export const teacherOnlyMiddleware = createMiddleware()
  .middleware([authenticatedMiddleware])
  .server(async ({ next, context }) => {
    const user = (context as { user: SessionPayload }).user;
    if (user.role !== "teacher" && user.role !== "admin" && !user.isAdmin) {
      throw new Error("Forbidden: This action requires faculty or administrator permissions.");
    }

    return await next({
      context: {
        user,
      },
    });
  });

/**
 * Middleware: Requires the user to be an Administrator.
 * Throws 403 if user is not an Admin.
 */
export const adminOnlyMiddleware = createMiddleware()
  .middleware([authenticatedMiddleware])
  .server(async ({ next, context }) => {
    const user = (context as { user: SessionPayload }).user;
    if (user.role !== "admin" && !user.isAdmin) {
      throw new Error("Forbidden: This action requires administrator permissions.");
    }

    return await next({
      context: {
        user,
      },
    });
  });
