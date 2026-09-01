import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { StudentShell } from "@/components/tarang/StudentShell";
import { useUser, clearUser } from "@/lib/auth";
import { TButton } from "@/components/tarang/Button";
import { Check } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile · Tarang" }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  component: ProfilePage,
});

function ProfilePage() {
  const user = useUser();
  const navigate = useNavigate();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [savedToast, setSavedToast] = useState(false);

  const handleLanguageChange = (selectedLang: "en" | "hi") => {
    setLang(selectedLang);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

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

        <div className="mt-4 rounded-[12px] border border-hairline bg-ink-900 p-5">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-[0.14em] text-tertiary-warm">
              Interface Language
            </p>
            {savedToast && (
              <span className="num inline-flex items-center gap-1 text-[11px] text-[#3FB8AF]">
                <Check size={12} /> Preference saved
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleLanguageChange("en")}
              className={
                "h-10 rounded-[12px] border text-[14px] transition cursor-pointer " +
                (lang === "en"
                  ? "border-[#3FB8AF] bg-[#3FB8AF]/10 text-primary-warm"
                  : "border-hairline text-secondary-warm hover:border-[#9C9388]")
              }
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange("hi")}
              className={
                "h-10 rounded-[12px] border text-[14px] transition cursor-pointer " +
                (lang === "hi"
                  ? "border-[#3FB8AF] bg-[#3FB8AF]/10 text-primary-warm"
                  : "border-hairline text-secondary-warm hover:border-[#9C9388]")
              }
            >
              हिन्दी
            </button>
          </div>
        </div>

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
