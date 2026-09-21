import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Download, WifiOff, Check, Share2, X } from "lucide-react";
import { useUser, clearUser } from "@/lib/auth";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Desktop-first shell wrapping teacher routes. Dense, console-like. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // PWA & Connection States
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);

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

  // Handle PWA installation and online/offline tracking
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if running in standalone PWA window
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandaloneMode);
    };
    checkStandalone();

    // Check initial online status
    setIsOnline(navigator.onLine);

    // Listen for install prompt from Chromium / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return;
    }

    // Check for iOS Safari
    const isIos =
      typeof window !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;

    if (isIos) {
      setShowIosModal(true);
    } else {
      // Fallback for browsers that hide beforeinstallprompt (e.g. Chrome desktop already evaluated)
      alert(
        "To install Trounce Console:\nClick the Install icon (⊕ or ⭳) in your browser address bar, or open browser menu (⋮) -> 'Install Trounce Teacher Console'.",
      );
    }
  };

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
      {/* Offline Status Warning Banner */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 border-b border-[#E55353]/30 bg-[#E55353]/15 px-4 py-2 text-[12px] font-medium text-[#FF8585]">
          <WifiOff className="size-4 animate-pulse" />
          <span>Offline Mode · Signal lost. Displaying cached dashboard data.</span>
        </div>
      )}

      {/* Back Online Notification */}
      {showReconnected && (
        <div className="flex items-center justify-center gap-2 border-b border-[#3FB8AF]/30 bg-[#3FB8AF]/15 px-4 py-2 text-[12px] font-medium text-[#3FB8AF] transition-all">
          <Check className="size-4" />
          <span>Signal Restored · Back online!</span>
        </div>
      )}

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
            {/* PWA Install Button or Standalone Badge */}
            {!isInstalled ? (
              <button
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/10 px-2.5 py-1 text-[12px] font-medium text-[#3FB8AF] transition hover:bg-[#3FB8AF]/20"
                title="Install Trounce Console as a standalone desktop or tablet app"
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-tertiary-warm">
                <span className="size-1.5 rounded-full bg-[#3FB8AF]" />
                Standalone App
              </span>
            )}

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

      {/* iOS Safari Installation Helper Modal */}
      {showIosModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="relative max-w-sm rounded-[16px] border border-hairline bg-ink-900 p-6 text-center shadow-2xl">
            <button
              onClick={() => setShowIosModal(false)}
              className="absolute top-4 right-4 text-tertiary-warm hover:text-primary-warm"
            >
              <X className="size-4" />
            </button>
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#3FB8AF]/15 text-[#3FB8AF]">
              <Share2 className="size-6" />
            </div>
            <h3 className="display text-[17px] font-semibold text-primary-warm">
              Install Trounce on iOS
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary-warm">
              To install this console to your iPad or iPhone Home Screen:
            </p>
            <ol className="mt-3 space-y-2 text-left text-[13px] text-secondary-warm">
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] text-[#3FB8AF]">
                  1
                </span>
                <span>
                  Tap the Safari <strong>Share</strong> button (⎋)
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] text-[#3FB8AF]">
                  2
                </span>
                <span>
                  Scroll and tap <strong>Add to Home Screen</strong>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] text-[#3FB8AF]">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top-right corner
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosModal(false)}
              className="mt-5 w-full rounded-[10px] bg-[#3FB8AF] py-2 text-[13px] font-semibold text-ink-950 transition hover:brightness-110"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-6 py-8">{children}</main>
    </div>
  );
}
