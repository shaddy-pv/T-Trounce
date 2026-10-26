import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "trounce_theme";
export const THEME_EVENT = "trounce_theme_change";

/**
 * Checks system-level color scheme preference
 */
export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Returns stored user theme, falling back to 'dark'
 */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") {
      return val;
    }
    return "dark";
  } catch {
    return "dark";
  }
}

/**
 * Resolves 'system' theme into concrete 'light' or 'dark'
 */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

/**
 * Applies the given theme classes and meta attributes to the DOM
 */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;

  if (resolved === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
    root.setAttribute("data-theme", "dark");
  }

  // Update mobile browser chrome status-bar theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", resolved === "light" ? "#F8FAFC" : "#100E0C");
  }
}

/**
 * Saves theme preference and broadcasts change to all open windows/tabs and components
 */
export function setStoredTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  } catch {
    // Ignore storage errors in private browsing
  }
}

/**
 * React hook to observe and toggle the application theme
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(getStoredTheme()),
  );

  useEffect(() => {
    // Ensure initial sync
    const currentStored = getStoredTheme();
    setThemeState(currentStored);
    setResolvedTheme(resolveTheme(currentStored));
    applyTheme(currentStored);

    const handleThemeChange = (e: Event) => {
      let nextTheme = getStoredTheme();
      if (e instanceof CustomEvent && e.detail?.theme) {
        nextTheme = e.detail.theme;
      }
      setThemeState(nextTheme);
      setResolvedTheme(resolveTheme(nextTheme));
      applyTheme(nextTheme);
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemChange = () => {
      const current = getStoredTheme();
      if (current === "system") {
        const nextResolved = resolveTheme("system");
        setResolvedTheme(nextResolved);
        applyTheme("system");
      }
    };

    window.addEventListener(THEME_EVENT, handleThemeChange);
    window.addEventListener("storage", handleThemeChange);
    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      window.removeEventListener(THEME_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolvedTheme(resolveTheme(next));
    setStoredTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isLight: resolvedTheme === "light",
  };
}
