import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  FileText,
  Flag,
  BarChart3,
  Users,
  ExternalLink,
} from "lucide-react";
import { useUser, clearUser } from "@/lib/auth";

/** Fully responsive, mobile-and-tablet-friendly shell wrapping teacher routes. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/assignments", label: "Assignments", icon: FileText },
    { to: "/flags", label: "Flags", icon: Flag },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/users", label: "Users & Teachers", icon: Users },
    ...(user?.isAdmin ? [{ to: "/practice", label: "Student View", icon: ExternalLink }] : []),
  ];

  const handleSignOut = () => {
    clearUser();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink-950/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-4 sm:px-6">
          {/* Logo & Desktop Nav */}
          <div className="flex items-center gap-4 lg:gap-8">
            <Link to="/dashboard" className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#3FB8AF]" />
              <span className="display text-[16px] font-semibold tracking-wide">trounce</span>
              <span className="num ml-1.5 text-[10px] sm:text-[11px] uppercase tracking-wider text-tertiary-warm">
                console
              </span>
            </Link>

            {/* Desktop / Tablet Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {nav.map((n) => {
                const active =
                  pathname === n.to || (n.to === "/dashboard" && pathname.startsWith("/students"));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      "rounded-[4px] px-2.5 lg:px-3 py-1.5 text-[13px] transition " +
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

          {/* Desktop Right Metadata */}
          <div className="hidden md:flex items-center gap-3 lg:gap-4">
            {user?.isAdmin && (
              <span className="rounded bg-[#3FB8AF]/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#3FB8AF]">
                ADMIN
              </span>
            )}
            <span className="num hidden lg:inline text-[12px] text-tertiary-warm">
              Batch · X-A · 2025
            </span>
            <span className="text-[13px] text-secondary-warm truncate max-w-[140px]">
              {user?.name || "Faculty"}
            </span>
            <button
              onClick={handleSignOut}
              className="text-[12px] text-tertiary-warm hover:text-secondary-warm transition"
            >
              Sign out
            </button>
          </div>

          {/* Mobile Right Controls: User Name + Hamburger Button */}
          <div className="flex md:hidden items-center gap-2.5">
            {user?.isAdmin && (
              <span className="rounded bg-[#3FB8AF]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#3FB8AF]">
                ADMIN
              </span>
            )}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex size-9 items-center justify-center rounded-lg border border-hairline bg-ink-900 text-secondary-warm transition hover:bg-ink-800 hover:text-primary-warm"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-hairline bg-ink-900/98 px-4 py-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between border-b border-hairline/60 pb-3">
              <div>
                <p className="text-[13px] font-semibold text-primary-warm">
                  {user?.name || "Faculty"}
                </p>
                <p className="num text-[11px] text-tertiary-warm">Batch · X-A · 2025</p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[12px] text-secondary-warm hover:text-alert-rust transition"
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {nav.map((n) => {
                const Icon = n.icon;
                const active =
                  pathname === n.to || (n.to === "/dashboard" && pathname.startsWith("/students"));
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition " +
                      (active
                        ? "bg-[#3FB8AF]/15 text-[#3FB8AF]"
                        : "text-secondary-warm hover:bg-ink-800 hover:text-primary-warm")
                    }
                  >
                    <Icon size={16} />
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Container: Mobile, Tablet & Desktop Responsive */}
      <main className="mx-auto max-w-[1280px] px-3 sm:px-6 py-5 sm:py-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
