import { Route as rootRoute } from "@/routes/__root";
import { getSessionFn, logoutFn } from "@/server/data";
import type { SessionPayload } from "@/server/services/auth.service";

export type Role = "admin" | "teacher" | "student";

export interface TrounceUser {
  userId: string;
  email: string;
  username?: string;
  name: string;
  role: Role;
  isAdmin?: boolean;
  isMasterAdmin?: boolean;
  phone?: string;
  batchId?: string;
  sessionSeason?: string;
  batchTime?: string;
}

let clientSessionCache: SessionPayload | null | undefined = undefined;
let clientSessionTimestamp = 0;
const CLIENT_SESSION_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Retrieves the active session. On the browser client, caches the session for 60 seconds
 * to eliminate blocking HTTP round-trips to the server during page switching.
 */
export async function fetchSessionWithCache(forceRefresh = false): Promise<SessionPayload | null> {
  // Always fetch fresh from cookie if running in SSR environment
  if (typeof window === "undefined") {
    return await getSessionFn();
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    clientSessionCache !== undefined &&
    now - clientSessionTimestamp < CLIENT_SESSION_TTL_MS
  ) {
    return clientSessionCache;
  }

  try {
    clientSessionCache = await getSessionFn();
    clientSessionTimestamp = now;
    return clientSessionCache;
  } catch {
    clientSessionCache = null;
    clientSessionTimestamp = now;
    return null;
  }
}

/**
 * Invalidates the client-side session cache immediately on login, logout, or session mutations.
 */
export function invalidateSessionCache(): void {
  clientSessionCache = undefined;
  clientSessionTimestamp = 0;
}

export function useUser() {
  const { session } = rootRoute.useRouteContext();
  return session as TrounceUser | null;
}

/**
 * Signs out, then reloads the login page. The full page load also clears all data held in memory.
 * The page only moves on once the cookie is gone, because navigating sooner could read the old
 * session and bounce straight back in.
 */
export async function clearUser(): Promise<void> {
  try {
    await logoutFn();
  } catch (err) {
    console.warn("Sign out failed:", err);
    window.alert("Could not sign out. Please check your connection and try again.");
    return;
  }
  invalidateSessionCache();
  window.location.href = "/login";
}
