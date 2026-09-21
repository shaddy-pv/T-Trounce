import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useUser, clearUser } from "@/lib/auth";

/** Mobile-first shell wrapping student routes. Calm, narrow, generous spacing. */
export function StudentShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Pre-warm student routes during browser idle time for 0ms transitions
  useEffect(() => {
    if (typeof window !== "undefined") {
      const timer = setTimeout(() => {
        router.preloadRoute({ to: "/practice" }).catch(() => {});
        router.preloadRoute({ to: "/progress" }).catch(() => {});
        router.preloadRoute({ to: "/profile" }).catch(() => {});
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [router]);

  const nav = [
    { to: "/practice", label: "Practice" },
    { to: "/progress", label: "Progress" },
    { to: "/profile", label: "Profile" },
  ] as const;

  const isRecording = pathname.startsWith("/practice/") || pathname.startsWith("/result/");

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col border-x border-hairline">
        {!isRecording && (
          <header className="flex items-center justify-between px-5 pt-6 pb-4">
            <Link to="/practice" className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#3FB8AF]" />
              <span className="display text-[16px] font-semibold tracking-wide">trounce</span>
            </Link>
            <div className="flex items-center gap-3">
              {user?.isAdmin && (
                <Link
                  to="/dashboard"
                  className="rounded border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 px-2.5 py-1 text-[11px] font-medium text-[#3FB8AF] hover:bg-[#3FB8AF]/25 transition"
                >
                  Console ➜
                </Link>
              )}
              <button
                onClick={() => {
                  clearUser();
                  navigate({ to: "/login", replace: true });
                }}
                className="text-[12px] text-tertiary-warm hover:text-secondary-warm"
              >
                Sign out
              </button>
            </div>
          </header>
        )}

        <main className="flex-1">{children}</main>

        {!isRecording && (
          <nav className="sticky bottom-0 grid grid-cols-3 border-t border-hairline bg-ink-950/95 backdrop-blur">
            {nav.map((n) => {
              const active =
                pathname === n.to || (n.to === "/practice" && pathname.startsWith("/practice"));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "flex h-14 items-center justify-center text-[13px] transition " +
                    (active ? "text-primary-warm" : "text-tertiary-warm hover:text-secondary-warm")
                  }
                >
                  <span
                    className={
                      "flex items-center gap-2 " + (active ? "border-b border-[#3FB8AF] pb-1" : "")
                    }
                  >
                    {n.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
