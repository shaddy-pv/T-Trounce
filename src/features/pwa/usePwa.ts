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

/**
 * What an "Install App" control should do. On a tap it opens the browser's real install dialog if
 * one is available, and otherwise opens the steps for this browser.
 */
export function useInstallAction() {
  const pwa = usePwaState();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const install = useCallback(async () => {
    if (getPwaState().mode === "prompt") {
      const outcome = await promptInstall();
      // The prompt can go stale without warning. Fall back to steps, not a dead button.
      if (outcome === "unavailable") setInstructionsOpen(true);
      return;
    }
    setInstructionsOpen(true);
  }, []);

  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  return {
    ...pwa,
    /** The option should be offered at all: the app is not installed and we know the state. */
    canOffer: pwa.mode === "prompt" || pwa.mode === "instructions" || pwa.mode === "unsupported",
    /** Worth promoting on the home screen: a real prompt, or simple steps on a phone. */
    canPromote:
      pwa.mode === "prompt" ||
      (pwa.mode === "instructions" && (pwa.platform === "ios" || pwa.platform === "android")),
    install,
    instructionsOpen,
    closeInstructions,
  };
}
