import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getPwaState,
  getServerPwaState,
  promptInstall,
  subscribePwa,
  type PwaState,
} from "./pwa-store";

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
}

export function triggerApkDownload() {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = "/Trounce.apk";
  link.download = "Trounce.apk";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * What an "Install App" control should do. On Android it directly downloads the official APK
 * and guides the user through installation so the app lives in the App Drawer with 0% browser badge.
 */
export function useInstallAction() {
  const pwa = usePwaState();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const install = useCallback(async () => {
    const isAndroid =
      pwa.platform === "android" ||
      (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent));

    if (isAndroid) {
      triggerApkDownload();
      setInstructionsOpen(true);
      return;
    }

    if (getPwaState().mode === "prompt") {
      const outcome = await promptInstall();
      // The prompt can go stale without warning. Fall back to steps, not a dead button.
      if (outcome === "unavailable") setInstructionsOpen(true);
      return;
    }
    setInstructionsOpen(true);
  }, [pwa.platform]);

  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  return {
    ...pwa,
    /** The option should be offered at all: the app is not installed and we know the state. */
    canOffer: pwa.mode !== "installed",
    /** Worth promoting on the home screen: a real prompt, Android APK, or simple steps on a phone. */
    canPromote: pwa.mode !== "installed",
    install,
    instructionsOpen,
    closeInstructions,
    triggerApkDownload,
  };
}
