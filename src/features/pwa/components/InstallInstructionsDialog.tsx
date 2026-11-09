import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import type { InstallMode, InstallPlatform } from "../pwa-store";

const STEPS: Partial<Record<InstallPlatform, { title: TranslationKey; steps: TranslationKey[] }>> =
  {
    ios: {
      title: "install_ios_title",
      steps: ["install_ios_step1", "install_ios_step2", "install_ios_step3"],
    },
    android: {
      title: "install_android_title",
      steps: ["install_android_step1", "install_android_step2", "install_android_step3"],
    },
    "mac-safari": {
      title: "install_macsafari_title",
      steps: ["install_macsafari_step1", "install_macsafari_step2"],
    },
    "desktop-chromium": {
      title: "install_desktop_title",
      steps: ["install_desktop_step1", "install_desktop_step2"],
    },
  };

/**
 * Manual install steps for browsers with no programmatic prompt, most importantly iPhone Safari.
 * A native dialog element handles focus trapping, Escape to close and the backdrop.
 */
export function InstallInstructionsDialog({
  open,
  onClose,
  platform,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
  mode: InstallMode;
}) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const content = mode === "unsupported" ? undefined : STEPS[platform];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialogRef.current) onClose();
      }}
      aria-labelledby="install-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[12px] border border-hairline bg-ink-900 p-0 text-left text-primary-warm backdrop:bg-black/70"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="install-dialog-title" className="display text-[18px] font-medium">
            {content ? t(content.title) : t("install_unsupported_title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("install_close")}
            className="shrink-0 rounded p-1 text-tertiary-warm transition hover:text-primary-warm cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {content ? (
          <ol className="mt-4 space-y-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-[14px] leading-relaxed">
                <span
                  aria-hidden="true"
                  className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-[#3FB8AF]/15 text-[12px] font-semibold text-[#3FB8AF] light:text-teal-800"
                >
                  {index + 1}
                </span>
                <span className="text-secondary-warm">{t(step)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-secondary-warm">
            {t("install_unsupported_desc")}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-[12px] border border-hairline text-[14px] font-medium text-primary-warm transition hover:border-[#9C9388] cursor-pointer"
        >
          {t("install_close")}
        </button>
      </div>
    </dialog>
  );
}
