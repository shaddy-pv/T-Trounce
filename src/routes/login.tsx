import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { TButton } from "@/components/tarang/Button";
import { Waveform, makeSampleWaveform } from "@/components/tarang/Waveform";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in · Trounce" }, { name: "description", content: "Sign in to Trounce." }],
  }),
  beforeLoad: ({ context }) => {
    if (context.session) {
      const isTeacherOrAdmin =
        context.session.role === "teacher" ||
        context.session.role === "admin" ||
        context.session.isAdmin;
      throw redirect({
        to: isTeacherOrAdmin ? "/dashboard" : "/practice",
      });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");

  const [formValidation, setFormValidation] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidation(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setFormValidation("Please enter both email and password.");
      return;
    }

    try {
      const user = await login(cleanEmail, cleanPassword, role);
      navigate({
        to:
          user.role === "admin"
            ? role === "student"
              ? "/practice"
              : "/dashboard"
            : user.role === "teacher"
              ? "/dashboard"
              : "/practice",
        replace: true,
      });
    } catch {
      // Error is captured and set by useAuth hook
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col lg:flex-row">
        {/* Left: brand panel */}
        <div className="flex flex-1 flex-col justify-between border-b border-hairline px-6 py-8 lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#3FB8AF]" />
            <span className="display text-[16px] font-semibold tracking-wide">trounce</span>
          </div>

          <div className="my-12 lg:my-0">
            <h1 className="display text-[28px] leading-tight lg:text-[40px]">
              Speak.
              <br />
              See your signal.
            </h1>
            <p className="mt-4 max-w-[36ch] text-[14px] text-secondary-warm">
              A spoken-English coaching tool built around the one thing that matters: the sound of
              your voice, on a waveform.
            </p>

            <div className="mt-8 rounded-[12px] border border-hairline bg-ink-900 p-5">
              <div className="num text-[12px] uppercase tracking-wider text-tertiary-warm">
                live · 00:14
              </div>
              <div className="mt-3">
                <Waveform mode="result" data={makeSampleWaveform(7, 56, 0.18)} height={84} />
              </div>
              <div className="mt-3 flex items-center gap-4 text-[12px] text-secondary-warm">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#3FB8AF]" />
                  clear
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#E2A33C]" />
                  filler
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#6B645A]" />
                  pause
                </span>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-tertiary-warm">
            For coaching institutes across India · Hindi & English
          </p>
        </div>

        {/* Right: form */}
        <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
          <form onSubmit={submit} className="w-full max-w-[360px]">
            <h2 className="display text-[20px]">Sign in</h2>
            <p className="mt-1 text-[14px] text-secondary-warm">
              Select your portal and enter your email credentials.
            </p>

            {(error || formValidation) && (
              <div className="mt-4 rounded-md border border-alert-rust bg-alert-rust/10 p-3 text-sm text-alert-rust">
                {formValidation || error}
              </div>
            )}

            {/* Role Selection Buttons */}
            <label className="mt-6 block text-[12px] uppercase tracking-wider text-tertiary-warm">
              Login Section
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["student", "teacher"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    "h-11 rounded-[12px] border text-[14px] font-medium capitalize transition " +
                    (role === r
                      ? "border-[#3FB8AF] bg-[#3FB8AF]/15 text-[#3FB8AF]"
                      : "border-hairline text-secondary-warm hover:border-[#9C9388]")
                  }
                >
                  {r === "student" ? "Student Portal" : "Teacher / Admin"}
                </button>
              ))}
            </div>

            {/* Email Address Input */}
            <label className="mt-6 block text-[12px] uppercase tracking-wider text-tertiary-warm">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. name@trounce.in"
              autoCapitalize="none"
              autoComplete="email"
              className="mt-2 h-11 w-full rounded-[12px] border border-hairline bg-ink-900 px-3 text-[14px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF]"
            />

            {/* Password Input */}
            <label className="mt-4 block text-[12px] uppercase tracking-wider text-tertiary-warm">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded-[12px] border border-hairline bg-ink-900 px-3 text-[14px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF]"
            />

            <TButton type="submit" size="lg" className="mt-6 w-full" disabled={isLoading}>
              {isLoading
                ? "Signing in..."
                : `Sign in as ${role === "teacher" ? "Teacher / Admin" : "Student"}`}
            </TButton>
          </form>
        </div>
      </div>
    </div>
  );
}
