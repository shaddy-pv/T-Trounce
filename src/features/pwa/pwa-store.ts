/**
 * Client-side state for installing and updating the app.
 *
 * Install availability is decided by the browser and can change at any moment, so this lives in a
 * small external store that any component can subscribe to. Everything here is browser-only; during
 * server rendering components see the "pending" state and render nothing.
 */

export type InstallPlatform = "ios" | "android" | "mac-safari" | "desktop-chromium" | "unsupported";

export type InstallMode =
  /** Not known yet (server render, or before the browser has been checked). */
  | "pending"
  /** Running as an installed app, or known to have been installed from this browser. */
  | "installed"
  /** The browser's own install prompt is ready. */
  | "prompt"
  /** No programmatic prompt on this browser, but it can be installed by following steps. */
  | "instructions"
  /** This browser cannot install web apps, or the page is not served over HTTPS. */
  | "unsupported";

export interface PwaState {
  mode: InstallMode;
  platform: InstallPlatform;
  /** The last native prompt was dismissed, so the UI can say it is still available later. */
  promptDismissed: boolean;
  /** A new version has been downloaded and is waiting for the user to apply it. */
  updateAvailable: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Captured by the inline script in __root.tsx, in case the event fires before hydration. */
    __trounceInstallPrompt?: Event;
  }
}

const INSTALLED_KEY = "trounce_pwa_installed";
const CARD_DISMISSED_KEY = "trounce_pwa_card_dismissed_until";
const CARD_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CHUNK_RELOAD_KEY = "trounce_chunk_reload_at";

export const SERVER_STATE: PwaState = {
  mode: "pending",
  platform: "unsupported",
  promptDismissed: false,
  updateAvailable: false,
};

let state: PwaState = SERVER_STATE;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let reloadOnControllerChange = false;
let registration: ServiceWorkerRegistration | null = null;

const listeners = new Set<() => void>();

function setState(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked, e.g. in private browsing. Install still works without it.
  }
}

/** Pure so it can be tested: works out the platform from browser details. */
export function detectPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(userAgent)) return "android";

  const isChromium = /Chrome|Chromium|Edg\/|OPR\//.test(userAgent);
  if (/Macintosh/.test(userAgent) && /Safari/.test(userAgent) && !isChromium) return "mac-safari";
  if (isChromium) return "desktop-chromium";
  return "unsupported";
}

export function isRunningStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    document.referrer.startsWith("android-app://")
  );
}

function modeWithoutPrompt(platform: InstallPlatform): InstallMode {
  if (isRunningStandalone() || readStorage(INSTALLED_KEY) === "1") return "installed";
  if (!window.isSecureContext) return "unsupported";
  return platform === "unsupported" ? "unsupported" : "instructions";
}

function captureInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  // The browser only offers this when the app is not installed, so any earlier record is out of
  // date, for example because the user has since uninstalled it.
  writeStorage(INSTALLED_KEY, null);
  if (!isRunningStandalone()) setState({ mode: "prompt", promptDismissed: false });
}

function markInstalled() {
  deferredPrompt = null;
  writeStorage(INSTALLED_KEY, "1");
  setState({ mode: "installed", promptDismissed: false });
}

/** Chromium on Android can report an already-installed copy, even from a normal browser tab. */
async function checkInstalledRelatedApps() {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<unknown[]>;
  };
  if (!nav.getInstalledRelatedApps) return;
  try {
    const apps = await nav.getInstalledRelatedApps();
    if (apps.length > 0) markInstalled();
  } catch {
    // Not supported in this context.
  }
}

function watchForWaitingWorker(reg: ServiceWorkerRegistration) {
  const noteIfWaiting = () => {
    // With no controller this is the first install, which is not an update.
    if (reg.waiting && navigator.serviceWorker.controller) setState({ updateAvailable: true });
  };
  noteIfWaiting();

  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") noteIfWaiting();
    });
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    // A worker left over from a production build would serve stale files in development.
    const existing = await navigator.serviceWorker.getRegistrations();
    await Promise.all(existing.map((reg) => reg.unregister()));
    return;
  }

  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    watchForWaitingWorker(registration);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadOnControllerChange) window.location.reload();
    });

    // Long-lived sessions, especially installed apps, should still notice new deployments.
    const checkForUpdate = () => void registration?.update().catch(() => {});
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  } catch (err) {
    console.warn("[PWA] Service worker registration failed:", err);
  }
}

/**
 * After a deployment an open tab can ask for a code file that no longer exists on the server. A
 * full reload picks up the new build. The guard stops a reload loop if something else is wrong.
 */
function recoverFromMissingChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    let lastReload = 0;
    try {
      lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - lastReload < 30000) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}

/** Safe to call more than once. Call from an effect, after hydration. */
export function initPwa() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  setState({ platform, mode: modeWithoutPrompt(platform) });

  window.addEventListener("beforeinstallprompt", captureInstallPrompt);
  window.addEventListener("appinstalled", markInstalled);
  window.matchMedia("(display-mode: standalone)").addEventListener("change", (event) => {
    if (event.matches) setState({ mode: "installed" });
  });

  if (window.__trounceInstallPrompt) {
    captureInstallPrompt(window.__trounceInstallPrompt);
    window.__trounceInstallPrompt = undefined;
  }

  void checkInstalledRelatedApps();
  recoverFromMissingChunks();
  void registerServiceWorker();
}

export const subscribePwa = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getPwaState = () => state;
export const getServerPwaState = () => SERVER_STATE;

/**
 * Opens the browser's own install dialog. The event can only be used once, so afterwards the app
 * falls back to manual steps until the browser offers the prompt again.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";

  deferredPrompt = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      markInstalled();
    } else {
      setState({ mode: modeWithoutPrompt(state.platform), promptDismissed: true });
    }
    return outcome;
  } catch (err) {
    console.warn("[PWA] Install prompt failed:", err);
    setState({ mode: modeWithoutPrompt(state.platform) });
    return "unavailable";
  }
}

/** Activates a waiting update and reloads into it. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloadOnControllerChange = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function isInstallCardSnoozed(): boolean {
  return Number(readStorage(CARD_DISMISSED_KEY) || 0) > Date.now();
}

export function snoozeInstallCard() {
  writeStorage(CARD_DISMISSED_KEY, String(Date.now() + CARD_SNOOZE_MS));
}
