import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { TButton } from "@/components/tarang/Button";
import { Waveform } from "@/components/tarang/Waveform";
import { makeSampleWaveform } from "@/lib/sample-waveform";
import { InstallLoginLink } from "@/features/pwa/components/InstallApp";
import { requestPasswordResetFn, resetPasswordWithCodeFn } from "@/server/data";
import { KeyRound, X, CheckCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in · Trounce" }, { name: "description", content: "Sign in to Trounce." }],
  }),
  beforeLoad: ({ context }) => {
    if (context.session) {
      const isTeacherOrAdmin =
        context.session.role === "teacher" ||
        context.session.role === "admin" ||
        context.session.role === "super_admin" ||
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

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotErr, setForgotErr] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotErr(null);
    setForgotMsg(null);
    if (!forgotEmail.trim()) {
      setForgotErr("Please enter your registered email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await requestPasswordResetFn({ data: { email: forgotEmail.trim() } });
      setForgotMsg(res.message);
      if (res.resetCode) {
        setForgotCode(res.resetCode);
      }
      setForgotStep("reset");
    } catch (err) {
      setForgotErr(err instanceof Error ? err.message : "Failed to request reset code.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotErr(null);
    setForgotMsg(null);
    if (!forgotCode.trim() || !newPassword.trim()) {
      setForgotErr("Please enter both the reset code and your new password.");
      return;
    }
    if (newPassword.trim().length < 6) {
      setForgotErr("New password must be at least 6 characters.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await resetPasswordWithCodeFn({
        data: {
          email: forgotEmail.trim(),
          code: forgotCode.trim(),
          newPassword: newPassword.trim(),
        },
      });
      setForgotMsg(res.message);
      setTimeout(() => {
        setPassword(newPassword.trim());
        setEmail(forgotEmail.trim());
        setShowForgotModal(false);
        setForgotStep("request");
      }, 1500);
    } catch (err) {
      setForgotErr(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setForgotLoading(false);
    }
  };

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
          user.role === "admin" || user.role === "super_admin"
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

            {/* Password Input Header */}
            <div className="mt-4 flex items-center justify-between">
              <label className="block text-[12px] uppercase tracking-wider text-tertiary-warm">
                Password
              </label>
              {role === "teacher" && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setShowForgotModal(true);
                    setForgotStep("request");
                    setForgotMsg(null);
                    setForgotErr(null);
                  }}
                  className="text-[12px] text-[#3FB8AF] hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              )}
            </div>
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

            <InstallLoginLink />
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-[16px] border border-hairline bg-ink-900 p-6 shadow-2xl relative">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute right-4 top-4 text-tertiary-warm hover:text-primary-warm cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#3FB8AF]/20 text-[#3FB8AF]">
                <KeyRound size={16} />
              </span>
              <h3 className="display text-[18px]">Reset Password</h3>
            </div>
            <p className="text-[13px] text-secondary-warm mb-5">
              {forgotStep === "request"
                ? "Enter your registered email address to receive a secure password reset code."
                : "Enter the reset code sent to your account and choose a new password."}
            </p>

            {forgotErr && (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-alert-rust bg-alert-rust/10 p-3 text-[13px] text-alert-rust">
                <AlertCircle size={15} className="shrink-0" />
                <span>{forgotErr}</span>
              </div>
            )}

            {forgotMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-[#3FB8AF]/40 bg-[#3FB8AF]/10 p-3 text-[13px] text-[#3FB8AF]">
                <CheckCircle size={15} className="shrink-0" />
                <span>{forgotMsg}</span>
              </div>
            )}

            {forgotStep === "request" ? (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label className="block text-[12px] uppercase tracking-wider text-tertiary-warm mb-1.5">
                    Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="e.g. admin@trounce.in"
                    className="h-11 w-full rounded-[10px] border border-hairline bg-ink-950 px-3 text-[14px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="rounded-[8px] border border-hairline px-4 py-2 text-[13px] text-secondary-warm hover:bg-ink-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="rounded-[8px] bg-[#3FB8AF] px-4 py-2 text-[13px] font-semibold text-[#100E0C] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    {forgotLoading ? "Generating..." : "Get Reset Code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-[12px] uppercase tracking-wider text-tertiary-warm mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotCode}
                    onChange={(e) => setForgotCode(e.target.value)}
                    placeholder="123456"
                    className="h-11 w-full rounded-[10px] border border-hairline bg-ink-950 px-3 text-[15px] font-mono tracking-widest text-[#3FB8AF] placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12px] uppercase tracking-wider text-tertiary-warm mb-1.5">
                    New Password (min 6 characters)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-[10px] border border-hairline bg-ink-950 px-3 text-[14px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep("request")}
                    className="text-[12px] text-tertiary-warm hover:underline cursor-pointer"
                  >
                    ← Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="rounded-[8px] border border-hairline px-4 py-2 text-[13px] text-secondary-warm hover:bg-ink-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="rounded-[8px] bg-[#3FB8AF] px-4 py-2 text-[13px] font-semibold text-[#100E0C] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                    >
                      {forgotLoading ? "Resetting..." : "Save New Password"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
