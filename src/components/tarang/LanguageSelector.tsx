import { useState, useRef, useEffect } from "react";
import { Languages, Globe, Check } from "lucide-react";
import { useLanguage, LANGUAGES, type Language } from "@/lib/i18n";

interface LanguageSelectorProps {
  /**
   * - "button": Compact dropdown or toggle button for headers/navbars
   * - "segmented": Horizontal segmented pills for profile and settings
   */
  variant?: "button" | "segmented";
  showLabel?: boolean;
  className?: string;
}

export function LanguageSelector({
  variant = "button",
  showLabel = false,
  className = "",
}: LanguageSelectorProps) {
  const { lang, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Language selection"
        className={`inline-flex items-center gap-1 rounded-[10px] border border-hairline bg-ink-800 p-1 ${className}`}
      >
        {LANGUAGES.map((opt) => {
          const active = lang === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLanguage(opt.code)}
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition cursor-pointer ${
                active
                  ? "bg-signal-teal text-[#100E0C] shadow-sm font-semibold"
                  : "text-secondary-warm hover:text-primary-warm hover:bg-ink-900"
              }`}
            >
              <span>{opt.native}</span>
              {opt.code !== "en" && opt.native !== opt.label && (
                <span className="opacity-70 text-[10px]">({opt.label})</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const currentOption = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Change language, currently ${currentOption.label}`}
        title={`Language: ${currentOption.label}`}
        className="group flex items-center justify-center gap-1.5 rounded-[8px] border border-hairline bg-ink-900 px-2.5 py-1.5 text-secondary-warm transition hover:bg-ink-800 hover:text-primary-warm cursor-pointer"
      >
        <Globe size={15} className="text-[#3FB8AF]" />
        <span className="num text-[11px] font-semibold text-primary-warm uppercase">
          {currentOption.short}
        </span>
        {showLabel && (
          <span className="text-[12px] text-secondary-warm hidden sm:inline">
            {currentOption.label}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 rounded-[10px] border border-hairline bg-ink-900 p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary-warm border-b border-hairline/60">
            Language / भाषा
          </p>
          <div className="mt-1 space-y-0.5">
            {LANGUAGES.map((opt) => {
              const active = lang === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => {
                    setLanguage(opt.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition cursor-pointer ${
                    active
                      ? "bg-signal-teal/15 text-[#3FB8AF] font-semibold"
                      : "text-secondary-warm hover:bg-ink-800 hover:text-primary-warm"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{opt.native}</span>
                    {opt.code === "hinglish" && (
                      <span className="text-[10px] text-tertiary-warm">(Hinglish)</span>
                    )}
                  </span>
                  {active && <Check size={13} className="text-[#3FB8AF]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
