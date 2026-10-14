import { useState, useEffect, useCallback } from "react";
import { getAppSettingsFn, updateAppSettingsFn } from "@/server/data";

const STORAGE_KEY = "trounce_live_transcription_enabled";
const SETTINGS_EVENT = "trounce_settings_change";

/**
 * Synchronous client reader for instant zero-latency checks
 */
export function getStoredLiveTranscriptionSetting(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    // Default is explicitly false (disabled)
    return item === "true";
  } catch {
    return false;
  }
}

/**
 * Saves setting locally and broadcasts change to all open views
 */
export function setStoredLiveTranscriptionSetting(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, { detail: { liveTranscriptionEnabled: enabled } }),
    );
  } catch {
    // ignore storage access errors
  }
}

/**
 * React hook to read and observe live transcription setting
 */
export function useLiveTranscriptionSetting() {
  const [enabled, setEnabled] = useState<boolean>(() => getStoredLiveTranscriptionSetting());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync from server on mount
  useEffect(() => {
    let isMounted = true;
    getAppSettingsFn()
      .then((settings) => {
        if (isMounted) {
          const val = Boolean(settings.liveTranscriptionEnabled);
          setEnabled(val);
          setStoredLiveTranscriptionSetting(val);
        }
      })
      .catch((err) => {
        console.debug("[useLiveTranscriptionSetting] Initial fetch note:", err);
      });

    const handleStorageOrCustom = (e: Event) => {
      if (e instanceof CustomEvent && e.detail) {
        setEnabled(Boolean(e.detail.liveTranscriptionEnabled));
      } else {
        setEnabled(getStoredLiveTranscriptionSetting());
      }
    };

    window.addEventListener(SETTINGS_EVENT, handleStorageOrCustom);
    window.addEventListener("storage", handleStorageOrCustom);
    return () => {
      isMounted = false;
      window.removeEventListener(SETTINGS_EVENT, handleStorageOrCustom);
      window.removeEventListener("storage", handleStorageOrCustom);
    };
  }, []);

  const toggleSetting = useCallback(async (newVal: boolean) => {
    // Optimistic UI update
    setEnabled(newVal);
    setStoredLiveTranscriptionSetting(newVal);
    setIsLoading(true);

    try {
      const res = await updateAppSettingsFn({
        data: { liveTranscriptionEnabled: newVal },
      });
      setEnabled(Boolean(res.liveTranscriptionEnabled));
      setStoredLiveTranscriptionSetting(Boolean(res.liveTranscriptionEnabled));
      return Boolean(res.liveTranscriptionEnabled);
    } catch (err) {
      console.warn("[toggleSetting] Server update failed, reverting:", err);
      // Revert if failed
      setEnabled(!newVal);
      setStoredLiveTranscriptionSetting(!newVal);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    enabled,
    isLoading,
    toggleSetting,
  };
}
