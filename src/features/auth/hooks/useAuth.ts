import { useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { loginFn, logoutFn } from "@/server/data";
import { Route as rootRoute } from "@/routes/__root";
import { invalidateSessionCache } from "@/lib/auth";

export function useAuth() {
  const router = useRouter();
  const { session } = rootRoute.useRouteContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (email: string, passwordPlain: string, role: "student" | "teacher") => {
      setIsLoading(true);
      setError(null);
      try {
        const user = await loginFn({
          data: {
            email,
            passwordPlain,
            role,
          },
        });
        invalidateSessionCache();
        await router.invalidate();
        return user;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to login";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      invalidateSessionCache();
      await logoutFn();
      await router.invalidate();
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const isAdmin = session?.role === "admin" || session?.isAdmin === true;
  const isTeacher = session?.role === "teacher" || isAdmin;
  const isStudent = session?.role === "student" || isAdmin;

  return {
    user: session,
    isLoading,
    error,
    login,
    logout,
    isAuthenticated: session !== null,
    isAdmin,
    isTeacher,
    isStudent,
  };
}
