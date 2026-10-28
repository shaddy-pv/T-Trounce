import { useState, useEffect, useCallback } from "react";
import { getAppSettingsFn, updateAppSettingsFn } from "@/server/data";

const STORAGE_KEY = "trounce_live_transcription_enabled";
const POST_STORAGE_KEY = "trounce_post_transcription_enabled";
const SETTINGS_EVENT = "trounce_settings_change";

/**
 * Synchronous client reader for instant zero-latency checks (Live STT)
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
 * Synchronous client reader for instant zero-latency checks (Post STT)
 */
export function getStoredPostTranscriptionSetting(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const item = localStorage.getItem(POST_STORAGE_KEY);
    // Default is true (enabled)
    return item === null ? true : item === "true";
  } catch {
    return true;
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
 * Saves post-transcription setting locally and broadcasts change
 */
export function setStoredPostTranscriptionSetting(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POST_STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, { detail: { postTranscriptionEnabled: enabled } }),
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

  // Sync from server on mount and window focus
  useEffect(() => {
    let isMounted = true;

    const syncFromServer = () => {
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
    };

    syncFromServer();

    const handleStorageOrCustom = (e: Event) => {
      if (e instanceof CustomEvent && e.detail && e.detail.liveTranscriptionEnabled !== undefined) {
        setEnabled(Boolean(e.detail.liveTranscriptionEnabled));
      } else {
        setEnabled(getStoredLiveTranscriptionSetting());
      }
    };

    const pollInterval = window.setInterval(syncFromServer, 5000);
    window.addEventListener("focus", syncFromServer);
    window.addEventListener(SETTINGS_EVENT, handleStorageOrCustom);
    window.addEventListener("storage", handleStorageOrCustom);
    return () => {
      isMounted = false;
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", syncFromServer);
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

/**
 * React hook to read and observe post-recording transcription setting
 */
export function usePostTranscriptionSetting() {
  const [enabled, setEnabled] = useState<boolean>(() => getStoredPostTranscriptionSetting());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Sync from server on mount and window focus
  useEffect(() => {
    let isMounted = true;

    const syncFromServer = () => {
      getAppSettingsFn()
        .then((settings) => {
          if (isMounted) {
            const val = settings.postTranscriptionEnabled ?? true;
            setEnabled(val);
            setStoredPostTranscriptionSetting(val);
          }
        })
        .catch((err) => {
          console.debug("[usePostTranscriptionSetting] Initial fetch note:", err);
        });
    };

    syncFromServer();

    const handleStorageOrCustom = (e: Event) => {
      if (e instanceof CustomEvent && e.detail && e.detail.postTranscriptionEnabled !== undefined) {
        setEnabled(Boolean(e.detail.postTranscriptionEnabled));
      } else {
        setEnabled(getStoredPostTranscriptionSetting());
      }
    };

    const pollInterval = window.setInterval(syncFromServer, 5000);
    window.addEventListener("focus", syncFromServer);
    window.addEventListener(SETTINGS_EVENT, handleStorageOrCustom);
    window.addEventListener("storage", handleStorageOrCustom);
    return () => {
      isMounted = false;
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", syncFromServer);
      window.removeEventListener(SETTINGS_EVENT, handleStorageOrCustom);
      window.removeEventListener("storage", handleStorageOrCustom);
    };
  }, []);

  const toggleSetting = useCallback(async (newVal: boolean) => {
    // Optimistic UI update
    setEnabled(newVal);
    setStoredPostTranscriptionSetting(newVal);
    setIsLoading(true);

    try {
      const res = await updateAppSettingsFn({
        data: { postTranscriptionEnabled: newVal },
      });
      const val = res.postTranscriptionEnabled ?? true;
      setEnabled(val);
      setStoredPostTranscriptionSetting(val);
      return val;
    } catch (err) {
      console.warn("[togglePostSetting] Server update failed, reverting:", err);
      setEnabled(!newVal);
      setStoredPostTranscriptionSetting(!newVal);
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
