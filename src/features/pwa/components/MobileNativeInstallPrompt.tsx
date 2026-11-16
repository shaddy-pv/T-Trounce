import { useState, useEffect } from "react";
import { Download, X, Sparkles } from "lucide-react";
import { useInstallAction } from "../usePwa";
import { isInstallCardSnoozed, snoozeInstallCard } from "../pwa-store";
import { InstallInstructionsDialog } from "./InstallInstructionsDialog";

/**
 * Mobile Native Install Prompt
 * Persistent, high-converting floating banner on mobile browsers that invites users
 * to install Trounce as a true native application on their phone home screen.
 * Automatically disappears once installed or running in standalone mode.
 */
export function MobileNativeInstallPrompt() {
  const action = useInstallAction();
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    setSnoozed(isInstallCardSnoozed());
  }, []);

  // Do not show if already installed, in standalone mode, or dismissed
  if (action.mode === "installed" || !action.canPromote || snoozed) {
    return <InstructionsFor action={action} />;
  }

  const handleDismiss = () => {
    snoozeInstallCard();
    setSnoozed(true);
  };

  return (
    <>
      <aside
        aria-label="Install Trounce Mobile App"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-3 z-40 mx-auto max-w-[440px] rounded-[14px] border border-[#3FB8AF]/40 bg-ink-900/98 p-3 shadow-2xl backdrop-blur-xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-center justify-between gap-3">
          {/* App Icon + Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative size-10 shrink-0 rounded-[10px] bg-ink-950 border border-hairline flex items-center justify-center overflow-hidden shadow-inner">
              <span className="size-2 rounded-full bg-[#3FB8AF] shadow-[0_0_8px_#3FB8AF]" />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#3FB8AF]/15 to-transparent pointer-events-none" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[13px] text-primary-warm truncate">
                  Trounce App
                </span>
                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 bg-[#3FB8AF]/15 text-[#3FB8AF] text-[9px] font-semibold uppercase tracking-wider">
                  <Sparkles size={9} />
                  Native
                </span>
              </div>
              <p className="text-[11px] text-secondary-warm truncate mt-0.5">
                Full-screen voice practice & offline access
              </p>
            </div>
          </div>

          {/* Action Button & Dismiss */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={action.install}
              className="inline-flex items-center gap-1 rounded-[8px] bg-[#3FB8AF] px-3 py-1.5 text-[12px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Download size={13} />
              <span>Install</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install banner"
              className="rounded p-1 text-tertiary-warm hover:text-primary-warm transition cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </aside>

      <InstructionsFor action={action} />
    </>
  );
}

function InstructionsFor({ action }: { action: ReturnType<typeof useInstallAction> }) {
  return (
    <InstallInstructionsDialog
      open={action.instructionsOpen}
      onClose={action.closeInstructions}
      platform={action.platform}
      mode={action.mode}
    />
  );
}

