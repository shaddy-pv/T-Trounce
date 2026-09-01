import { Route as rootRoute } from "@/routes/__root";
import { logoutFn } from "@/server/data";
import { useRouter } from "@tanstack/react-router";

export type Role = "admin" | "teacher" | "student";

export interface TarangUser {
  userId: string;
  email: string;
  username?: string;
  name: string;
  role: Role;
  isAdmin?: boolean;
  batchId?: string;
  sessionSeason?: string;
  batchTime?: string;
}

export function useUser() {
  const { session } = rootRoute.useRouteContext();
  return session as TarangUser | null;
}

export function clearUser() {
  // This is a fire-and-forget backward compatibility function.
  // Proper components should use the `logout` from `useAuth` to properly handle loading state and router invalidation.
  logoutFn().then(() => {
    window.location.href = "/login";
  });
}
