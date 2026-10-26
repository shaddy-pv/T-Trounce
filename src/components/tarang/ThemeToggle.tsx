import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { useLanguage } from "@/lib/i18n";

interface ThemeToggleProps {
  /**
   * - "button": Compact icon toggle button (ideal for headers/navbars)
   * - "segmented": Full 3-way toggle (Dark / Light / System) for profile & settings
   */
  variant?: "button" | "segmented";
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({
  variant = "button",
  showLabel = false,
  className = "",
}: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme, isLight } = useTheme();
  const { t } = useLanguage();

  if (variant === "segmented") {
    const options: { value: Theme; label: string; icon: typeof Sun }[] = [
      { value: "dark", label: t("theme_dark"), icon: Moon },
      { value: "light", label: t("theme_light"), icon: Sun },
      { value: "system", label: t("theme_system"), icon: Laptop },
    ];

    return (
      <div
        role="radiogroup"
        aria-label="Theme preference"
        className={`inline-flex items-center gap-1 rounded-[10px] border border-hairline bg-ink-800 p-1 ${className}`}
      >
        {options.map((opt) => {
          const active = theme === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition cursor-pointer ${
                active
                  ? "bg-signal-teal text-[#100E0C] shadow-sm font-semibold"
                  : "text-secondary-warm hover:text-primary-warm hover:bg-ink-900"
              }`}
            >
              <Icon size={14} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Compact header/navbar toggle button
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to Dark theme" : "Switch to Light theme"}
      title={isLight ? "Switch to Dark theme" : "Switch to Light theme"}
      className={`group flex items-center justify-center gap-1.5 rounded-[8px] border border-hairline bg-ink-900 px-2.5 py-1.5 text-secondary-warm transition hover:bg-ink-800 hover:text-primary-warm cursor-pointer ${className}`}
    >
      {isLight ? (
        <>
          <Moon size={16} className="text-[#3FB8AF] transition group-hover:rotate-12" />
          {showLabel && (
            <span className="text-[12px] font-medium text-primary-warm">{t("theme_dark")}</span>
          )}
        </>
      ) : (
        <>
          <Sun size={16} className="text-[#E2A33C] transition group-hover:rotate-45" />
          {showLabel && (
            <span className="text-[12px] font-medium text-primary-warm">{t("theme_light")}</span>
          )}
        </>
      )}
    </button>
  );
}
