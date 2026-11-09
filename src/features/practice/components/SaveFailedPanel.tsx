import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

/** Shown when a finished recording could not be saved. It stays on the device until saved. */
export function SaveFailedPanel({
  message,
  isSaving,
  onRetry,
  onDiscard,
}: {
  message: string | null;
  isSaving: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div role="alert" className="rounded-[12px] border border-[#C1503B]/60 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-primary-warm">
        <AlertTriangle size={15} className="shrink-0 text-[#C1503B]" aria-hidden="true" />
        {t("save_failed_title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-secondary-warm">
        {t("save_failed_desc")}
      </p>
      {message && <p className="mt-1 text-[12px] text-tertiary-warm">{message}</p>}

      <button
        type="button"
        onClick={onRetry}
        disabled={isSaving}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#3FB8AF] text-[14px] font-semibold text-[#100E0C] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
      >
        {isSaving ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw size={16} aria-hidden="true" />
        )}
        {isSaving ? t("save_saving_btn") : t("save_retry_btn")}
      </button>

      <button
        type="button"
        onClick={() => {
          if (window.confirm(t("save_discard_confirm"))) onDiscard();
        }}
        disabled={isSaving}
        className="mt-2 w-full py-2 text-[12px] text-tertiary-warm transition hover:text-secondary-warm disabled:opacity-50 cursor-pointer"
      >
        {t("save_discard_btn")}
      </button>
    </div>
  );
}
