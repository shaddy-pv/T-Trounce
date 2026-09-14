import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { StudentShell } from "@/components/tarang/StudentShell";
import { useUser, clearUser } from "@/lib/auth";
import { TButton } from "@/components/tarang/Button";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile · Trounce" }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  component: ProfilePage,
});

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
