import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { useUser } from "@/lib/auth";
import { useLiveTranscriptionSetting, usePostTranscriptionSetting } from "@/lib/app-settings";
import { getAppSettingsFn } from "@/server/data";
import {
  Mic,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileText,
  Shield,
  Layers,
  Cpu,
  Radio,
  Power,
  RotateCcw,
  Sun,
  Globe,
} from "lucide-react";
import { ThemeToggle } from "@/components/tarang/ThemeToggle";
import { LanguageSelector } from "@/components/tarang/LanguageSelector";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "System Settings · Trounce" },
      {
        name: "description",
        content: "Administer system capabilities, live speech engines, and institute defaults.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    const isMasterAdmin = context.session.email?.toLowerCase() === "shadanmd566@gmail.com";
    if (!isMasterAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async () => {
    return await getAppSettingsFn();
  },
  component: SettingsPage,
});

function SettingsPage() {
  const initialSettings = Route.useLoaderData();
  const user = useUser();
  const { t } = useLanguage();
  const isMasterAdmin =
    user?.role === "admin" ||
    user?.isAdmin ||
    user?.email?.toLowerCase() === "shadanmd566@gmail.com";

  const {
    enabled: liveEnabled,
    isLoading: liveLoading,
    toggleSetting: toggleLive,
  } = useLiveTranscriptionSetting();
  const {
    enabled: postEnabled,
    isLoading: postLoading,
    toggleSetting: togglePost,
  } = usePostTranscriptionSetting();

  const [notification, setNotification] = useState<string | null>(null);

  if (!isMasterAdmin) {
    return (
      <TeacherShell>
        <div className="py-16 text-center">
          <p className="text-[16px] text-secondary-warm">
            Access to System Settings is strictly restricted to master administrator
            (shadanmd566@gmail.com).
          </p>
        </div>
      </TeacherShell>
    );
  }

  const handleToggleLive = async () => {
    const nextVal = !liveEnabled;
    try {
      await toggleLive(nextVal);
      setNotification(
        nextVal
          ? "Live transcription has been enabled for all practice sessions."
          : "Live transcription has been disabled. Clean recording mode is now active.",
      );
      setTimeout(() => setNotification(null), 4000);
    } catch {
      setNotification("Failed to update setting. Please try again.");
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleTogglePost = async () => {
    const nextVal = !postEnabled;
    try {
      await togglePost(nextVal);
      setNotification(
        nextVal
          ? "Post-recording transcription pass enabled. Audio will be transcribed upon stop."
          : "Post-recording transcription disabled. Full-audio cloud pass will be skipped.",
      );
      setTimeout(() => setNotification(null), 4000);
    } catch {
      setNotification("Failed to update setting. Please try again.");
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <TeacherShell>
      <div className="space-y-8 pb-16">
        {/* Header strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#3FB8AF]">
              <Sliders size={14} />
              <span>FACULTY & ADMIN SETTINGS</span>
            </div>
            <h1 className="display mt-1 text-[28px] sm:text-[32px] font-semibold tracking-tight text-primary-warm">
              System Settings
            </h1>
            <p className="mt-1 text-[14px] text-secondary-warm max-w-2xl">
              Configure voice capture diagnostics, speech-to-text engines, and administrative
              preferences.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#3FB8AF]/30 bg-[#3FB8AF]/10 px-3 py-1 text-[12px] font-medium text-[#3FB8AF]">
              {user?.isAdmin ? "Administrator Mode" : "Faculty Mode"}
            </span>
          </div>
        </div>

        {/* Toast Notification */}
        {notification && (
          <div
            className={`flex items-center gap-3 rounded-[12px] border p-4 text-[13px] transition animate-in fade-in slide-in-from-top-2 duration-200 ${
              notification.includes("disabled")
                ? "border-hairline bg-ink-900 text-secondary-warm"
                : notification.includes("enabled")
                  ? "border-[#3FB8AF]/40 bg-[#3FB8AF]/10 text-primary-warm"
                  : "border-alert-rust/40 bg-alert-rust/10 text-alert-rust"
            }`}
          >
            <CheckCircle2 size={16} className="text-[#3FB8AF] shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Feature Toggle Card 1: Live Transcription */}
        <section className="rounded-[16px] border border-hairline bg-ink-900/95 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-hairline">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#3FB8AF]/15 text-[#3FB8AF]">
                  <Mic size={17} />
                </span>
                <h2 className="text-[18px] font-semibold text-primary-warm">
                  Live Transcription During Recording
                </h2>
              </div>
              <p className="text-[13px] leading-relaxed text-secondary-warm">
                Toggle whether real-time speech captions appear character-by-character on student
                screens while they speak into the microphone.
              </p>
            </div>

            {/* Interactive Toggle Switch */}
            <div className="flex items-center gap-4 sm:flex-col sm:items-end">
              <button
                type="button"
                role="switch"
                aria-checked={liveEnabled}
                disabled={liveLoading}
                onClick={handleToggleLive}
                className={`relative inline-flex h-8 w-15 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#3FB8AF] focus:ring-offset-2 focus:ring-offset-ink-950 disabled:opacity-50 ${
                  liveEnabled ? "bg-[#3FB8AF]" : "bg-ink-800 border-hairline"
                }`}
              >
                <span className="sr-only">Toggle live transcription</span>
                <span
                  className={`pointer-events-none inline-block size-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    liveEnabled ? "translate-x-7" : "translate-x-0 bg-[#A69E93]"
                  }`}
                />
              </button>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                  liveEnabled
                    ? "bg-[#3FB8AF]/20 text-[#3FB8AF]"
                    : "bg-ink-800 text-tertiary-warm border border-hairline"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    liveEnabled ? "bg-[#3FB8AF] animate-pulse" : "bg-[#6B645A]"
                  }`}
                />
                {liveEnabled ? "Active (ON)" : "Disabled (OFF)"}
              </span>
            </div>
          </div>

          {/* Detailed explanation of states */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className={`rounded-[12px] border p-4 transition ${
                !liveEnabled
                  ? "border-[#3FB8AF]/40 bg-ink-950/80 shadow-md"
                  : "border-hairline/60 bg-ink-950/40 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-warm">
                  <span className="size-2 rounded-full bg-[#E2A33C]" />
                  Clean Audio Capture (Recommended)
                </span>
                {!liveEnabled && (
                  <span className="rounded bg-[#3FB8AF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#3FB8AF]">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-secondary-warm">
                Microphone audio is captured cleanly without real-time browser STT interruptions or
                delay. When the student stops, complete audio is processed with verbatim accuracy.
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-tertiary-warm">
                <li>✓ Zero distractions or inaccurate interim captions during speaking</li>
                <li>✓ 100% resilient across all network connections and browser variants</li>
                <li>✓ Clean audio waveform and optimal acoustic scoring</li>
              </ul>
            </div>

            <div
              className={`rounded-[12px] border p-4 transition ${
                liveEnabled
                  ? "border-[#3FB8AF]/40 bg-ink-950/80 shadow-md"
                  : "border-hairline/60 bg-ink-950/40 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-warm">
                  <span className="size-2 rounded-full bg-[#3FB8AF]" />
                  Real-Time Live STT (Streaming Mode)
                </span>
                {liveEnabled && (
                  <span className="rounded bg-[#3FB8AF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#3FB8AF]">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-secondary-warm">
                Attempts client-side Web Speech API recognition directly in the browser. Spoken
                words appear as live interim captions.
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-tertiary-warm">
                <li>• Instant low-latency display directly on the student screen</li>
                <li>• May experience network stalls on strict firewalls</li>
                <li>• Automatically switches to offline badge if speech servers drop</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Feature Toggle Card 2: Post-Recording Transcription */}
        <section className="rounded-[16px] border border-hairline bg-ink-900/95 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-hairline">
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#3FB8AF]/15 text-[#3FB8AF]">
                  <FileText size={17} />
                </span>
                <h2 className="text-[18px] font-semibold text-primary-warm">
                  Post-Recording Transcription (Accuracy Pass)
                </h2>
              </div>
              <p className="text-[13px] leading-relaxed text-secondary-warm">
                Toggle whether full-audio AI/Whisper transcription runs automatically after the
                student finishes recording to produce a verbatim transcript.
              </p>
            </div>

            {/* Interactive Toggle Switch */}
            <div className="flex items-center gap-4 sm:flex-col sm:items-end">
              <button
                type="button"
                role="switch"
                aria-checked={postEnabled}
                disabled={postLoading}
                onClick={handleTogglePost}
                className={`relative inline-flex h-8 w-15 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#3FB8AF] focus:ring-offset-2 focus:ring-offset-ink-950 disabled:opacity-50 ${
                  postEnabled ? "bg-[#3FB8AF]" : "bg-ink-800 border-hairline"
                }`}
              >
                <span className="sr-only">Toggle post-recording transcription</span>
                <span
                  className={`pointer-events-none inline-block size-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    postEnabled ? "translate-x-7" : "translate-x-0 bg-[#A69E93]"
                  }`}
                />
              </button>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                  postEnabled
                    ? "bg-[#3FB8AF]/20 text-[#3FB8AF]"
                    : "bg-ink-800 text-tertiary-warm border border-hairline"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    postEnabled ? "bg-[#3FB8AF] animate-pulse" : "bg-[#6B645A]"
                  }`}
                />
                {postEnabled ? "Active (ON)" : "Disabled (OFF)"}
              </span>
            </div>
          </div>

          {/* Explanation */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className={`rounded-[12px] border p-4 transition ${
                postEnabled
                  ? "border-[#3FB8AF]/40 bg-ink-950/80 shadow-md"
                  : "border-hairline/60 bg-ink-950/40 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-warm">
                  <span className="size-2 rounded-full bg-[#3FB8AF]" />
                  Full-Audio Whisper Pass (Active)
                </span>
                {postEnabled && (
                  <span className="rounded bg-[#3FB8AF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#3FB8AF]">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-secondary-warm">
                Upon stopping, complete recorded audio is sent to FastWhisper for full verbatim
                analysis, capturing every spoken word, pause, and hesitation.
              </p>
            </div>

            <div
              className={`rounded-[12px] border p-4 transition ${
                !postEnabled
                  ? "border-[#3FB8AF]/40 bg-ink-950/80 shadow-md"
                  : "border-hairline/60 bg-ink-950/40 opacity-70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-warm">
                  <span className="size-2 rounded-full bg-[#E2A33C]" />
                  Offline Mode / Server Conservation
                </span>
                {!postEnabled && (
                  <span className="rounded bg-[#3FB8AF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#3FB8AF]">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-secondary-warm">
                Skips post-recording server transcription pass. Uses whatever transcript was
                captured in real time or acoustic analysis, preserving server compute.
              </p>
            </div>
          </div>
        </section>

        {/* Engine Pipeline Architecture Status */}
        <section className="rounded-[16px] border border-hairline bg-ink-900/90 p-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-hairline">
            <Cpu size={18} className="text-[#3FB8AF]" />
            <h2 className="text-[16px] font-semibold text-primary-warm">
              Speech Processing Infrastructure
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-[12px] border border-hairline/80 bg-ink-950/70 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Post-Recording STT
              </p>
              <p className="mt-1 text-[15px] font-medium text-primary-warm flex items-center gap-1.5">
                <Cpu size={14} className="text-[#3FB8AF]" />
                FastWhisper Engine
              </p>
              <p className="mt-1 text-[12px] text-secondary-warm">
                Verbatim speech inference. Runs on full audio after stop.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#3FB8AF]">
                <CheckCircle2 size={13} />
                <span>{postEnabled ? "Active (Enabled)" : "Disabled via toggle"}</span>
              </div>
            </div>

            <div className="rounded-[12px] border border-hairline/80 bg-ink-950/70 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Live Voice STT
              </p>
              <p className="mt-1 text-[15px] font-medium text-primary-warm flex items-center gap-1.5">
                <Radio size={14} className="text-[#3FB8AF]" />
                Web Speech API (en-IN)
              </p>
              <p className="mt-1 text-[12px] text-secondary-warm">
                Real-time browser speech recognition for Indian English dialects.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                {liveEnabled ? (
                  <span className="text-[#3FB8AF] flex items-center gap-1">
                    <CheckCircle2 size={13} /> Enabled via toggle
                  </span>
                ) : (
                  <span className="text-secondary-warm flex items-center gap-1">
                    <Power size={13} /> Disabled by administrator
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-[12px] border border-hairline/80 bg-ink-950/70 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                DSP Audio Chain
              </p>
              <p className="mt-1 text-[15px] font-medium text-primary-warm flex items-center gap-1.5">
                <Layers size={14} className="text-[#3FB8AF]" />
                High-Pass + Dynamic EQ
              </p>
              <p className="mt-1 text-[12px] text-secondary-warm">
                120Hz highpass filter, 2.5kHz vocal presence boost, and dynamic compression.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#3FB8AF]">
                <CheckCircle2 size={13} />
                <span>Web Audio API · Active</span>
              </div>
            </div>
          </div>
        </section>

        {/* Administrator Profile Details */}
        <section className="rounded-[16px] border border-hairline bg-ink-900/90 p-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-hairline">
            <Shield size={18} className="text-[#3FB8AF]" />
            <h2 className="text-[16px] font-semibold text-primary-warm">
              Active Administrator Account
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-[12px] border border-hairline bg-ink-950/60 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">Name</p>
              <p className="mt-1 text-[15px] font-medium text-primary-warm">
                {user?.name || "Administrator"}
              </p>
              <p className="num mt-1 text-[11px] text-tertiary-warm">Master Account</p>
            </div>

            <div className="rounded-[12px] border border-hairline bg-ink-950/60 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">Email</p>
              <p className="mt-1 text-[15px] font-medium text-primary-warm truncate">
                {user?.email || "admin@trounce.edu"}
              </p>
              <p className="num mt-1 text-[11px] text-tertiary-warm">Verified Authentication</p>
            </div>

            <div className="rounded-[12px] border border-hairline bg-ink-950/60 p-4">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Permission Scope
              </p>
              <p className="mt-1 text-[15px] font-medium text-[#3FB8AF] capitalize">
                {user?.role || "Admin"} Privileges
              </p>
              <p className="num mt-1 text-[11px] text-tertiary-warm">Full System Administration</p>
            </div>
          </div>
        </section>

        {/* Interface Appearance & Language */}
        <section className="rounded-[16px] border border-hairline bg-ink-900/90 p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-hairline">
              <Globe size={18} className="text-[#3FB8AF]" />
              <div>
                <h2 className="text-[16px] font-semibold text-primary-warm">
                  {t("lang_pref_title")}
                </h2>
                <p className="text-[12px] text-tertiary-warm mt-0.5">{t("lang_pref_desc")}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-primary-warm">System Display Language</p>
                <p className="text-[12px] text-tertiary-warm">
                  Choose between English, Hinglish, or Hindi
                </p>
              </div>
              <LanguageSelector variant="segmented" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-hairline">
              <Sun size={18} className="text-[#E2A33C]" />
              <div>
                <h2 className="text-[16px] font-semibold text-primary-warm">
                  {t("theme_pref_title")}
                </h2>
                <p className="text-[12px] text-tertiary-warm mt-0.5">{t("theme_pref_desc")}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-primary-warm">Color Theme Mode</p>
                <p className="text-[12px] text-tertiary-warm">Light, Dark, or System preference</p>
              </div>
              <ThemeToggle variant="segmented" />
            </div>
          </div>
        </section>
      </div>
    </TeacherShell>
  );
}
