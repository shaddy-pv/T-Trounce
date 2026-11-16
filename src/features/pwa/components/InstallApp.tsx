import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Download, RefreshCw, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { applyUpdate, isInstallCardSnoozed, snoozeInstallCard } from "../pwa-store";
import { useInstallAction, usePwaState } from "../usePwa";
import { InstallInstructionsDialog } from "./InstallInstructionsDialog";

type InstallAction = ReturnType<typeof useInstallAction>;

function InstructionsFor({ action }: { action: InstallAction }) {
  return (
    <InstallInstructionsDialog
      open={action.instructionsOpen}
      onClose={action.closeInstructions}
      platform={action.platform}
      mode={action.mode}
    />
  );
}

/** Shown after someone closes the browser's install dialog, so they know it isn't gone for good. */
function DismissedNote({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <p role="status" className={`text-[12px] text-tertiary-warm ${className}`}>
      {t("install_dismissed_note")}
    </p>
  );
}

/**
 * Home screen card. It is deliberately easy to dismiss, and stays away for two weeks when dismissed.
 * The navigation entries remain available regardless.
 */
export function InstallHomeCard({
  surface = "deck",
  className = "",
}: {
  surface?: "deck" | "console";
  className?: string;
}) {
  const { t } = useLanguage();
  const action = useInstallAction();
  const [hidden, setHidden] = useState(true);

  // localStorage isn't available during server rendering, so this is read after hydration.
  useEffect(() => setHidden(isInstallCardSnoozed()), []);

  if (action.instructionsOpen) return <InstructionsFor action={action} />;
  if (!action.canPromote || hidden) return null;

  const radius = surface === "console" ? "rounded-[4px]" : "rounded-[12px]";

  return (
    <section
      aria-label={t("install_card_title")}
      className={`${radius} border border-[#3FB8AF]/30 bg-ink-900 p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[#3FB8AF]/15 text-[#3FB8AF] light:text-teal-700">
          <Download size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-primary-warm">{t("install_card_title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-secondary-warm">
            {t("install_card_desc")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={action.install}
              className={`inline-flex h-9 items-center gap-1.5 ${radius} bg-[#3FB8AF] px-3.5 text-[13px] font-semibold text-[#100E0C] transition hover:brightness-110 cursor-pointer`}
            >
              <Download size={14} aria-hidden="true" />
              {t("install_app")}
            </button>
            <button
              type="button"
              onClick={() => {
                snoozeInstallCard();
                setHidden(true);
              }}
              className="h-9 px-2 text-[13px] text-tertiary-warm transition hover:text-secondary-warm cursor-pointer"
            >
              {t("install_not_now")}
            </button>
          </div>
          {action.promptDismissed && <DismissedNote className="mt-2" />}
        </div>
        <button
          type="button"
          aria-label={t("install_not_now")}
          onClick={() => {
            snoozeInstallCard();
            setHidden(true);
          }}
          className="shrink-0 rounded p-1 text-tertiary-warm transition hover:text-primary-warm cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>
    </section>
  );
}

/** Row in the teacher console's navigation drawer. */
export function InstallDrawerItem() {
  const { t } = useLanguage();
  const action = useInstallAction();
  if (!action.canOffer) return null;

  return (
    <>
      <button
        type="button"
        onClick={action.install}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium text-secondary-warm transition hover:bg-ink-800 hover:text-primary-warm cursor-pointer"
      >
        <Download size={16} aria-hidden="true" />
        <span>{t("install_app")}</span>
      </button>
      {action.promptDismissed && <DismissedNote className="px-3" />}
      <InstructionsFor action={action} />
    </>
  );
}

/** Compact button for the teacher console's desktop header, which has no drawer. */
export function InstallHeaderButton() {
  const { t } = useLanguage();
  const action = useInstallAction();
  if (action.mode !== "prompt" && !action.instructionsOpen) return null;

  return (
    <>
      {action.mode === "prompt" && (
        <button
          type="button"
          onClick={action.install}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-hairline px-2.5 py-1 text-[12px] text-secondary-warm transition hover:border-[#3FB8AF] hover:text-primary-warm cursor-pointer"
        >
          <Download size={13} aria-hidden="true" />
          {t("install_app")}
        </button>
      )}
      <InstructionsFor action={action} />
    </>
  );
}

/** Extra tab in the student bottom navigation, present only while there is something to install. */
export function InstallNavTab() {
  const { t } = useLanguage();
  const action = useInstallAction();

  if (!action.canPromote) return null;

  return (
    <>
      <button
        type="button"
        onClick={action.install}
        className="flex h-16 flex-col items-center justify-center gap-1 text-center text-secondary-warm transition hover:text-primary-warm cursor-pointer"
      >
        <Download size={18} aria-hidden="true" />
        <span className="text-[12px] font-medium leading-tight">{t("install_tab")}</span>
      </button>
      <InstructionsFor action={action} />
    </>
  );
}

/** Card on the student profile. It also confirms when the app is already installed. */
export function InstallProfileCard() {
  const { t } = useLanguage();
  const action = useInstallAction();
  if (action.mode === "pending") return null;

  return (
    <div className="mt-4 rounded-[12px] border border-hairline bg-ink-900 p-5">
      {action.mode === "installed" ? (
        <p className="flex items-center gap-2 text-[14px] font-medium text-primary-warm">
          <CheckCircle2 size={15} className="text-[#3FB8AF]" aria-hidden="true" />
          {t("install_installed_title")}
        </p>
      ) : (
        <>
          <p className="flex items-center gap-2 text-[14px] font-medium text-primary-warm">
            <Download size={15} className="text-[#3FB8AF]" aria-hidden="true" />
            {t("install_app")}
          </p>
          <p className="mt-0.5 text-[12px] text-tertiary-warm">{t("install_card_desc")}</p>
          <button
            type="button"
            onClick={action.install}
            className="mt-3 h-11 w-full rounded-[12px] bg-[#3FB8AF] text-[14px] font-semibold text-[#100E0C] transition hover:brightness-110 cursor-pointer"
          >
            {t("install_app")}
          </button>
          {action.promptDismissed && <DismissedNote className="mt-2" />}
          <InstructionsFor action={action} />
        </>
      )}
    </div>
  );
}

/** Quiet link on the sign-in page, the first page people see from a shared link. */
export function InstallLoginLink() {
  const { t } = useLanguage();
  const action = useInstallAction();
  if (!action.canPromote && !action.instructionsOpen) return null;

  return (
    <div className="mt-5 text-center">
      {action.canPromote && (
        <button
          type="button"
          onClick={action.install}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#3FB8AF] transition hover:underline light:text-teal-700 cursor-pointer"
        >
          <Download size={14} aria-hidden="true" />
          {t("install_app")}
        </button>
      )}
      {action.promptDismissed && <DismissedNote className="mt-2" />}
      <InstructionsFor action={action} />
    </div>
  );
}

/**
 * Offers a new version after a deployment. It never reloads by itself, and is hidden on recording
 * screens, so a student can't lose a take to an update.
 */
export function PwaUpdateBanner() {
  const { t } = useLanguage();
  const { updateAvailable } = usePwaState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!updateAvailable || pathname.startsWith("/practice/")) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-[12px] border border-[#3FB8AF]/40 bg-ink-900 px-4 py-3 shadow-lg lg:bottom-4"
    >
      <span className="text-[13px] text-primary-warm">{t("update_ready")}</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-[#3FB8AF] px-3 py-1.5 text-[12px] font-semibold text-[#100E0C] transition hover:brightness-110 cursor-pointer"
      >
        <RefreshCw size={13} aria-hidden="true" />
        {t("update_refresh")}
      </button>
    </div>
  );
}
