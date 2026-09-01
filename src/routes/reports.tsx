import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Check, Printer } from "lucide-react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { fetchStudentRosterFn } from "@/server/data";
import { TButton } from "@/components/tarang/Button";
import { StatusDot } from "@/components/tarang/StatusDot";
import { ParentReportCard } from "@/features/reports/components/ParentReportCard";
import { generateParentReportWhatsAppLink } from "@/features/reports/lib/whatsapp";
import type { StudentRow } from "@/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Reports · Tarang" }],
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
  component: ReportsPage,
});

function ReportsPage() {
  const studentRoster = Route.useLoaderData();
  const [selectedId, setSelectedId] = useState<string>(studentRoster[0]?.id ?? "");
  const [sentIds, setSentIds] = useState<string[]>([]);
  const s: StudentRow = studentRoster.find((x) => x.id === selectedId) ??
    studentRoster[0] ?? {
      id: "empty",
      name: "Student",
      status: "on-track",
      focus: "—",
      lastActive: "Today",
      scorePct: 75,
      trendPct: 2,
      waveform: [],
    };

  const sendWhatsApp = () => {
    setSentIds((arr) => [...new Set([...arr, s.id])]);
    const url = generateParentReportWhatsAppLink(s);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const printReport = () => {
    window.print();
  };

  return (
    <TeacherShell>
      <div className="border-b border-hairline pb-6">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
          parent reports
        </p>
        <h1 className="display mt-2 text-[28px]">This week's signal</h1>
        <p className="mt-1 text-[13px] text-secondary-warm">
          Pick a student. Preview is exactly what the parent receives on WhatsApp.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Roster list */}
        <div className="rounded-[4px] border border-hairline">
          <div className="border-b border-hairline px-3 py-2 num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
            roster · {studentRoster.length} students
          </div>
          <ul>
            {studentRoster.map((r, i) => {
              const active = r.id === selectedId;
              const sent = sentIds.includes(r.id);
              return (
                <li key={r.id} className={i > 0 ? "border-t border-hairline" : ""}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition cursor-pointer " +
                      (active
                        ? "bg-ink-800 text-primary-warm"
                        : "text-secondary-warm hover:bg-ink-900")
                    }
                  >
                    <StatusDot status={r.status} />
                    <span className="flex-1">{r.name}</span>
                    {sent ? (
                      <span className="num inline-flex items-center gap-1 text-[11px] text-[#3FB8AF]">
                        <Check size={12} /> sent
                      </span>
                    ) : (
                      <span className="num text-[11px] text-tertiary-warm">{r.scorePct}%</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Preview pane */}
        <div>
          <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
            preview · what the parent sees
          </p>

          <ParentReportCard student={s} />

          <div className="mt-4 flex items-center justify-center gap-3">
            <TButton variant="secondary" surface="console" size="md" onClick={printReport}>
              <Printer size={14} />
              Print / Save PDF
            </TButton>
            <TButton surface="console" size="md" onClick={sendWhatsApp}>
              <Send size={14} />
              {sentIds.includes(s.id) ? "Resend to WhatsApp" : "Share via WhatsApp"}
            </TButton>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
