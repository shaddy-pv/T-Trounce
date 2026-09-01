import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { Waveform } from "@/components/tarang/Waveform";
import { StatusDot } from "@/components/tarang/StatusDot";
import { fetchStudentRosterFn, updateStudentStatusFn } from "@/server/data";
import type { StudentRow } from "@/types";
import { Check, BellRing } from "lucide-react";

export const Route = createFileRoute("/flags")({
  head: () => ({
    meta: [{ title: "Flags · Tarang" }],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    if (
      context.session.role !== "teacher" &&
      context.session.role !== "admin" &&
      !context.session.isAdmin
    ) {
      throw redirect({ to: "/practice" });
    }
  },
  loader: async () => {
    return await fetchStudentRosterFn();
  },
  component: FlagsPage,
});

function FlagsPage() {
  const router = useRouter();
  const initialRoster = Route.useLoaderData();
  const [roster, setRoster] = useState<StudentRow[]>(initialRoster);
  const [actingId, setActingId] = useState<string | null>(null);

  const flagged = roster.filter((s) => s.status === "flagged");
  const nudge = roster.filter((s) => s.status === "nudge");

  const resolveFlag = async (studentId: string) => {
    setActingId(studentId);
    try {
      await updateStudentStatusFn({ data: { studentId, status: "on-track" } });
      setRoster((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, status: "on-track", flagReason: undefined } : s,
        ),
      );
      router.invalidate();
    } finally {
      setActingId(null);
    }
  };

  const sendNudge = async (studentId: string) => {
    setActingId(studentId);
    try {
      await updateStudentStatusFn({ data: { studentId, status: "nudge" } });
      setRoster((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: "nudge" } : s)));
      router.invalidate();
    } finally {
      setActingId(null);
    }
  };

  return (
    <TeacherShell>
      <div className="border-b border-hairline pb-6">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-[#C1503B]">red-flag panel</p>
        <h1 className="display mt-2 text-[28px]">Students who need you</h1>
        <p className="mt-1 text-[13px] text-secondary-warm">
          Ranked by urgency. Rust dot = act this week. Amber = next session is fine.
        </p>
      </div>

      <Section
        title="Flagged"
        tone="rust"
        rows={flagged}
        actingId={actingId}
        onResolve={resolveFlag}
        onNudge={sendNudge}
      />
      <Section
        title="Needs a nudge"
        tone="amber"
        rows={nudge}
        actingId={actingId}
        onResolve={resolveFlag}
        onNudge={sendNudge}
      />
    </TeacherShell>
  );
}

function Section({
  title,
  tone,
  rows,
  actingId,
  onResolve,
  onNudge,
}: {
  title: string;
  tone: "rust" | "amber";
  rows: StudentRow[];
  actingId: string | null;
  onResolve: (id: string) => void;
  onNudge: (id: string) => void;
}) {
  const accent = tone === "rust" ? "text-[#C1503B]" : "text-[#E2A33C]";
  const border = tone === "rust" ? "border-dashed border-[#C1503B]/60" : "border-hairline";

  return (
    <section className="mt-8">
      <p className={"num text-[11px] uppercase tracking-[0.18em] " + accent}>
        {title} · {rows.length}
      </p>
      <div className={"mt-3 overflow-hidden rounded-[4px] border " + border}>
        <table className="w-full text-[13px]">
          <tbody>
            {rows.map((s, i) => (
              <tr
                key={s.id}
                className={
                  "transition hover:bg-ink-900 " + (i > 0 ? "border-t border-hairline" : "")
                }
              >
                <td className="w-6 px-3 py-3">
                  <StatusDot status={s.status} />
                </td>
                <td className="px-2 py-3">
                  <Link
                    to="/students/$id"
                    params={{ id: s.id }}
                    className="font-medium text-primary-warm hover:underline"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-2 py-3 w-[200px]">
                  <Waveform mode="thumbnail" data={s.waveform} height={20} />
                </td>
                <td className="num px-2 py-3 text-secondary-warm">
                  {s.flagReason ?? `${s.focus} · ${s.scorePct}%`}
                </td>
                <td className="num px-2 py-3 text-right text-secondary-warm">{s.lastActive}</td>
                <td className="px-2 py-3 text-right space-x-3">
                  {s.status === "flagged" ? (
                    <button
                      onClick={() => onNudge(s.id)}
                      disabled={actingId === s.id}
                      className="inline-flex items-center gap-1 num text-[12px] text-[#E2A33C] hover:underline cursor-pointer"
                    >
                      <BellRing size={12} />
                      Nudge
                    </button>
                  ) : null}
                  <button
                    onClick={() => onResolve(s.id)}
                    disabled={actingId === s.id}
                    className="inline-flex items-center gap-1 num text-[12px] text-[#3FB8AF] hover:underline cursor-pointer"
                  >
                    <Check size={12} />
                    Resolve
                  </button>
                  <Link
                    to="/students/$id"
                    params={{ id: s.id }}
                    className="num text-[12px] text-tertiary-warm hover:text-primary-warm"
                  >
                    Dossier →
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-tertiary-warm">
                  No one here. Keep going.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
