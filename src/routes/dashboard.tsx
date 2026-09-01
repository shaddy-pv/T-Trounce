import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { fetchStudentRosterFn } from "@/server/data";
import { BatchMeters } from "@/features/dashboard/components/BatchMeters";
import { FlaggedAlertPanel } from "@/features/dashboard/components/FlaggedAlertPanel";
import { ChannelStripTable } from "@/features/dashboard/components/ChannelStripTable";
import { Send, BookOpen, Layers } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Batch dashboard · Tarang" },
      {
        name: "description",
        content: "Batch overview as a channel-strip console — every student's signal at a glance.",
      },
    ],
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
  component: Dashboard,
});

function Dashboard() {
  const allStudents = Route.useLoaderData();

  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");

  const filteredStudents = allStudents.filter((s) => {
    const matchesSession =
      selectedSession === "all" || (s.sessionSeason || "summer") === selectedSession;
    const matchesBatch = selectedBatch === "all" || (s.batchTime || "morning") === selectedBatch;
    return matchesSession && matchesBatch;
  });

  const flagged = filteredStudents.filter((s) => s.status === "flagged");
  const nudge = filteredStudents.filter((s) => s.status === "nudge");
  const onTrack = filteredStudents.filter((s) => s.status === "on-track");
  const rest = [...nudge, ...onTrack];

  const totalActiveToday = filteredStudents.filter((s) => s.lastActive === "Today").length;

  const avgScore =
    filteredStudents.length > 0
      ? Math.round(filteredStudents.reduce((a, s) => a + s.scorePct, 0) / filteredStudents.length)
      : 0;

  return (
    <TeacherShell>
      {/* Header strip */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
            batch signal health
          </p>
          <h1 className="display mt-2 text-[28px]">
            {filteredStudents.length} active students
            <span className="num ml-3 text-[14px] font-normal text-secondary-warm">
              · {flagged.length} need attention · {totalActiveToday} recorded today
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/assignments"
            className="inline-flex h-10 items-center gap-2 rounded-[4px] border border-hairline bg-ink-900 px-4 text-[13px] font-medium text-primary-warm transition hover:border-[#3FB8AF]"
          >
            <BookOpen size={14} className="text-[#3FB8AF]" />
            Give Homework
          </Link>
          <Link
            to="/reports"
            className="inline-flex h-10 items-center gap-2 rounded-[4px] bg-[#3FB8AF] px-4 text-[13px] font-medium text-[#100E0C] transition hover:brightness-110"
          >
            <Send size={14} />
            Generate reports
          </Link>
        </div>
      </div>

      {/* Session & Batch Selector Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-hairline bg-ink-900 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 num text-[11px] uppercase tracking-wider text-tertiary-warm mr-2">
            <Layers size={13} className="text-[#3FB8AF]" />
            Session:
          </span>
          {[
            { id: "all", label: "All Sessions" },
            { id: "summer", label: "Summer (Apr–Jun)" },
            { id: "autumn", label: "Autumn (Jul–Sep)" },
            { id: "winter", label: "Winter (Oct–Dec)" },
            { id: "spring", label: "Spring (Jan–Mar)" },
          ].map((ses) => (
            <button
              key={ses.id}
              onClick={() => setSelectedSession(ses.id)}
              className={
                "rounded-[6px] px-2.5 py-1 text-[12px] transition " +
                (selectedSession === ses.id
                  ? "bg-[#3FB8AF] text-[#100E0C] font-semibold"
                  : "text-secondary-warm hover:bg-ink-800 hover:text-primary-warm")
              }
            >
              {ses.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 border-t sm:border-t-0 sm:border-l border-hairline pt-2 sm:pt-0 sm:pl-4">
          <span className="num text-[11px] uppercase tracking-wider text-tertiary-warm mr-2">
            Batch:
          </span>
          {[
            { id: "all", label: "All Batches" },
            { id: "morning", label: "Morning" },
            { id: "evening", label: "Evening" },
          ].map((bt) => (
            <button
              key={bt.id}
              onClick={() => setSelectedBatch(bt.id)}
              className={
                "rounded-[6px] px-2.5 py-1 text-[12px] transition " +
                (selectedBatch === bt.id
                  ? "bg-[#E2A33C] text-[#100E0C] font-semibold"
                  : "text-secondary-warm hover:bg-ink-800 hover:text-primary-warm")
              }
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Meters */}
      <BatchMeters
        onTrackCount={onTrack.length}
        nudgeCount={nudge.length}
        flaggedCount={flagged.length}
        avgScore={avgScore}
      />

      {/* Flagged Alert Panel */}
      <FlaggedAlertPanel flagged={flagged} totalCount={filteredStudents.length} />

      {/* Full Roster Channel Strips */}
      <ChannelStripTable students={rest} />
    </TeacherShell>
  );
}
