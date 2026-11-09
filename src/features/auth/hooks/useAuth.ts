import { useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { loginFn } from "@/server/data";
import { invalidateSessionCache } from "@/lib/auth";

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (email: string, passwordPlain: string, role: "student" | "teacher") => {
      setIsLoading(true);
      setError(null);
      try {
        const user = await loginFn({ data: { email, passwordPlain, role } });
        invalidateSessionCache();
        await router.invalidate();
        return user;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to login");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  return { isLoading, error, login };
}
