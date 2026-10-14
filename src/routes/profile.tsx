import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { StudentShell } from "@/components/tarang/StudentShell";
import { useUser, clearUser } from "@/lib/auth";
import { TButton } from "@/components/tarang/Button";
import { useLiveTranscriptionSetting } from "@/lib/app-settings";
import { Mic, Settings, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile · Trounce" }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  component: ProfilePage,
});

function AdminFeatureSettingsCard() {
  const { enabled, isLoading, toggleSetting } = useLiveTranscriptionSetting();

  return (
    <div className="mt-4 rounded-[12px] border border-[#3FB8AF]/30 bg-ink-900 p-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-hairline/60">
        <div className="flex items-center gap-2">
          <Settings size={15} className="text-[#3FB8AF]" />
          <span className="num text-[11px] uppercase tracking-[0.14em] text-[#3FB8AF] font-semibold">
            Admin System Control
          </span>
        </div>
        <Link
          to="/settings"
          className="text-[11px] text-[#3FB8AF] hover:underline flex items-center gap-1"
        >
          All Settings ➜
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[14px] font-medium flex items-center gap-2 text-primary-warm">
            <Mic size={14} className="text-[#3FB8AF]" />
            Live Transcription
          </p>
          <p className="text-[12px] text-tertiary-warm leading-tight">
            Captions during audio recording. (Post-recording AI pass always runs)
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={isLoading}
          onClick={() => toggleSetting(!enabled)}
          className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:opacity-50 ${
            enabled ? "bg-[#3FB8AF]" : "bg-ink-800 border-hairline"
          }`}
        >
          <span className="sr-only">Toggle live transcription</span>
          <span
            className={`pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-6" : "translate-x-0 bg-[#A69E93]"
            }`}
          />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between text-[11px] rounded-lg bg-ink-950/70 px-3 py-2 border border-hairline/40">
        <span className="text-secondary-warm">Current Status:</span>
        <span
          className={`font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 ${
            enabled ? "text-[#3FB8AF]" : "text-tertiary-warm"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              enabled ? "bg-[#3FB8AF] animate-pulse" : "bg-[#6B645A]"
            }`}
          />
          {enabled ? "Active (ON)" : "Disabled (OFF)"}
        </span>
      </div>
    </div>
  );
}

function ProfilePage() {
  const user = useUser();
  const navigate = useNavigate();

  return (
    <StudentShell>
      <div className="px-5 pt-2 pb-10">
        <h1 className="display text-[28px]">Profile</h1>

        <div className="mt-6 rounded-[12px] border border-hairline bg-ink-900 p-5">
          <p className="num text-[11px] uppercase tracking-[0.14em] text-tertiary-warm">
            Signed in as
          </p>
          <p className="mt-1 text-[18px] font-medium">{user?.name ?? "Student"}</p>
          <p className="num mt-1 text-[12px] capitalize text-secondary-warm">
            {user?.role ?? "student"}
          </p>
        </div>

        <div className="mt-4 rounded-[12px] border border-hairline bg-ink-900 p-5">
          <p className="num text-[11px] uppercase tracking-[0.14em] text-tertiary-warm">
            Coaching Batch
          </p>
          <p className="mt-1 text-[15px] capitalize">
            {user?.sessionSeason ? `${user.sessionSeason} Session` : "General Session"} ·{" "}
            {user?.batchTime ? `${user.batchTime} Batch` : "Unassigned"}
          </p>
          <p className="num mt-1 text-[12px] text-tertiary-warm">Local MongoDB Synchronized</p>
        </div>

        {/* Admin / Faculty Feature Settings Card */}
        {(user?.isAdmin || user?.role === "admin" || user?.role === "teacher") && (
          <AdminFeatureSettingsCard />
        )}

        <TButton
          variant="secondary"
          size="lg"
          className="mt-8 w-full cursor-pointer"
          onClick={() => {
            clearUser();
            navigate({ to: "/login", replace: true });
          }}
        >
          Sign out
        </TButton>
      </div>
    </StudentShell>
  );
}

