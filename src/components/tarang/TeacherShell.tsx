import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useUser, clearUser } from "@/lib/auth";

/** Desktop-first shell wrapping teacher routes. Dense, console-like. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Pre-warm teacher routes during browser idle time for 0ms transitions
  useEffect(() => {
    if (typeof window !== "undefined") {
      const timer = setTimeout(() => {
        router.preloadRoute({ to: "/dashboard" }).catch(() => {});
        router.preloadRoute({ to: "/assignments" }).catch(() => {});
        router.preloadRoute({ to: "/flags" }).catch(() => {});
        router.preloadRoute({ to: "/reports" }).catch(() => {});
        router.preloadRoute({ to: "/users" }).catch(() => {});
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [router]);

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/assignments", label: "Assignments" },
    { to: "/flags", label: "Flags" },
    { to: "/reports", label: "Reports" },
    { to: "/users", label: "Users & Teachers" },
    ...(user?.isAdmin ? [{ to: "/practice", label: "Student View" }] : []),
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#3FB8AF]" />
              <span className="display text-[16px] font-semibold tracking-wide">trounce</span>
              <span className="num ml-2 text-[11px] uppercase tracking-wider text-tertiary-warm">
                console
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((n) => {
                const active =
                  pathname === n.to || (n.to === "/dashboard" && pathname.startsWith("/students"));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      "rounded-[4px] px-3 py-1.5 text-[13px] transition " +
                      (active
                        ? "bg-ink-800 text-primary-warm"
                        : "text-secondary-warm hover:text-primary-warm hover:bg-ink-900")
                    }
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {user?.isAdmin && (
              <span className="rounded bg-[#3FB8AF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#3FB8AF]">
                ADMIN
              </span>
            )}
            <span className="num text-[12px] text-tertiary-warm">Batch · X-A · 2025</span>
            <span className="text-[13px] text-secondary-warm">{user?.name || "Faculty"}</span>
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
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 py-8">{children}</main>
    </div>
  );
}
