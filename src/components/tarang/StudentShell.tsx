import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Mic, TrendingUp, User as UserIcon } from "lucide-react";
import { useUser, clearUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/tarang/ThemeToggle";
import { LanguageSelector } from "@/components/tarang/LanguageSelector";
import { useLanguage } from "@/lib/i18n";

/** Mobile-first shell wrapping student routes. Calm, narrow, generous spacing. */
export function StudentShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useLanguage();

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
    { to: "/practice", label: t("nav_practice"), icon: Mic },
    { to: "/progress", label: t("nav_progress"), icon: TrendingUp },
    { to: "/profile", label: t("nav_profile"), icon: UserIcon },
  ] as const;

  const isRecording = pathname.startsWith("/practice/") || pathname.startsWith("/result/");

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col border-x border-hairline">
        {!isRecording && (
          <header className="flex items-center justify-between px-5 pt-6 pb-4">
            <Link to="/practice" className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#3FB8AF] light:bg-teal-600 shadow-[0_0_8px_#3FB8AF] light:shadow-none" />
              <span className="display text-[17px] font-semibold tracking-wide">trounce</span>
              <span className="text-[11px] font-semibold text-[#3FB8AF] bg-[#3FB8AF]/15 light:bg-teal-100/90 light:text-teal-800 light:border light:border-teal-200 px-2 py-0.5 rounded-full">
                {t("student_badge")}
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSelector variant="button" />
              <ThemeToggle showLabel={false} />
              {user?.isAdmin && (
                <Link
                  to="/dashboard"
                  className="rounded-md border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 px-2.5 py-1 text-[11px] font-semibold text-[#3FB8AF] light:border-teal-300 light:bg-teal-50 light:text-teal-800 hover:bg-[#3FB8AF]/25 transition"
                >
                  {t("console_btn")}
                </Link>
              )}
              <button
                onClick={() => {
                  clearUser();
                  navigate({ to: "/login", replace: true });
                }}
                className="text-[12px] text-tertiary-warm hover:text-secondary-warm px-2 py-1 rounded cursor-pointer"
              >
                {t("sign_out")}
              </button>
            </div>
          </header>
        )}

        <main className="flex-1">{children}</main>

        {!isRecording && (
          <nav className="sticky bottom-0 grid grid-cols-3 border-t border-hairline bg-ink-950/98 light:bg-white/95 backdrop-blur-md z-30 shadow-lg">
            {nav.map((n) => {
              const active =
                pathname === n.to || (n.to === "/practice" && pathname.startsWith("/practice"));
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "flex flex-col h-16 items-center justify-center gap-1 transition text-center " +
                    (active
                      ? "text-[#3FB8AF] light:text-teal-700 bg-ink-900/60 light:bg-teal-50/80 font-semibold"
                      : "text-secondary-warm hover:text-primary-warm")
                  }
                >
                  <Icon size={18} className={active ? "text-[#3FB8AF] light:text-teal-700" : "text-secondary-warm"} />
                  <span className="text-[12px] font-medium leading-tight">{n.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
