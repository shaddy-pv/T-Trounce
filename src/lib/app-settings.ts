import { useState, useEffect, useCallback } from "react";
import { getAppSettingsFn, updateAppSettingsFn } from "@/server/data";

const SETTINGS_EVENT = "trounce_settings_change";

type SettingKey = "liveTranscriptionEnabled" | "postTranscriptionEnabled";

const SETTINGS: Record<SettingKey, { storageKey: string; defaultValue: boolean }> = {
  liveTranscriptionEnabled: {
    storageKey: "trounce_live_transcription_enabled",
    defaultValue: false,
  },
  postTranscriptionEnabled: {
    storageKey: "trounce_post_transcription_enabled",
    defaultValue: true,
  },
};

function readStored(key: SettingKey): boolean {
  const { storageKey, defaultValue } = SETTINGS[key];
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = localStorage.getItem(storageKey);
    return item === null ? defaultValue : item === "true";
  } catch {
    return defaultValue;
  }
}

/** Saves locally and tells every open view about the change. */
function writeStored(key: SettingKey, enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS[key].storageKey, enabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { [key]: enabled } }));
  } catch {
    // Ignore storage access errors
  }
}

// Screens often use several of these hooks at once, so they all share one request.
const REQUEST_REUSE_MS = 30 * 1000;
let sharedRequest: ReturnType<typeof getAppSettingsFn> | null = null;

function fetchSettingsShared() {
  if (!sharedRequest) {
    sharedRequest = getAppSettingsFn();
    const clear = () => {
      setTimeout(() => {
        sharedRequest = null;
      }, REQUEST_REUSE_MS);
    };
    sharedRequest.then(clear, () => {
      sharedRequest = null;
    });
  }
  return sharedRequest;
}

function useTranscriptionSetting(key: SettingKey) {
  const [enabled, setEnabled] = useState<boolean>(() => readStored(key));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    fetchSettingsShared()
      .then((settings) => {
        if (!isMounted) return;
        const value = settings[key] ?? SETTINGS[key].defaultValue;
        setEnabled(value);
        writeStored(key, value);
      })
      .catch((err) => {
        console.debug("[useTranscriptionSetting] Initial fetch failed:", err);
      });

    const handleChange = (e: Event) => {
      const changed = e instanceof CustomEvent ? e.detail?.[key] : undefined;
      setEnabled(changed !== undefined ? Boolean(changed) : readStored(key));
    };

    window.addEventListener(SETTINGS_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      isMounted = false;
      window.removeEventListener(SETTINGS_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, [key]);

  const toggleSetting = useCallback(
    async (newVal: boolean) => {
      // Optimistic UI update, reverted if the server rejects it
      setEnabled(newVal);
      writeStored(key, newVal);
      setIsLoading(true);

      try {
        const res = await updateAppSettingsFn({ data: { [key]: newVal } });
        sharedRequest = null;
        const value = res[key] ?? SETTINGS[key].defaultValue;
        setEnabled(value);
        writeStored(key, value);
        return value;
      } catch (err) {
        console.warn("[toggleSetting] Server update failed, reverting:", err);
        setEnabled(!newVal);
        writeStored(key, !newVal);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [key],
  );

  return { enabled, isLoading, toggleSetting };
}

/** Whether interim captions are shown while recording. */
export function useLiveTranscriptionSetting() {
  return useTranscriptionSetting("liveTranscriptionEnabled");
}

/** Whether the full-audio transcription pass runs after recording. */
export function usePostTranscriptionSetting() {
  return useTranscriptionSetting("postTranscriptionEnabled");
}
