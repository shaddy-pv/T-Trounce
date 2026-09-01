import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Award,
} from "lucide-react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { Waveform, makeSampleWaveform, type WaveformSegment } from "@/components/tarang/Waveform";
import { StatusDot } from "@/components/tarang/StatusDot";
import { fetchStudentProfileFn } from "@/server/data";
import { TButton } from "@/components/tarang/Button";
import { DirectNoteModal } from "@/features/students/components/DirectNoteModal";
import { AudioTranscriptEvaluator } from "@/features/students/components/AudioTranscriptEvaluator";
import type { StudentRow, AttemptResult } from "@/types";

export interface StudentProfileData {
  student: StudentRow;
  homeworkStats: {
    totalReceived: number;
    completed: number;
    pending: number;
    assignments: {
      id: string;
      title: string;
      difficulty: string;
      dueDate?: string;
      completed: boolean;
    }[];
  };
  attempts: AttemptResult[];
}

export const Route = createFileRoute("/students/$id")({
  beforeLoad: ({ context, params }) => {
    if (!context.session) throw redirect({ to: "/login" });
    const isFaculty =
      context.session.role === "teacher" ||
      context.session.role === "admin" ||
      context.session.isAdmin;
    const isSelf = context.session.userId === params.id;
    if (!isFaculty && !isSelf) {
      throw redirect({ to: "/practice" });
    }
  },
  loader: async ({ params }): Promise<StudentProfileData | null> => {
    const profile = (await fetchStudentProfileFn({
      data: params.id,
    })) as unknown as StudentProfileData | null;
    return profile;
  },
  head: ({ loaderData }) => {
    const s = (loaderData as unknown as StudentProfileData | null)?.student;
    return {
      meta: [{ title: `${s?.name ?? "Student Profile"} · Tarang` }],
    };
  },
  component: StudentDetail,
});

function StudentDetail() {
  const profile = Route.useLoaderData() as unknown as StudentProfileData | null;
  const student = profile?.student ?? null;
  const attempts = profile?.attempts ?? [];
  const homeworkStats = profile?.homeworkStats ?? {
    totalReceived: 0,
    completed: 0,
    pending: 0,
    assignments: [],
  };

  const [messageOpen, setMessageOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const s: StudentRow = student ?? {
    id: "unknown",
    name: "Student",
    status: "on-track",
    focus: "—",
    lastActive: "Today",
    scorePct: 75,
    trendPct: 0,
    waveform: [],
    sessionSeason: "summer",
    batchTime: "morning",
  };

  const sessionLabel = s.sessionSeason
    ? s.sessionSeason.charAt(0).toUpperCase() + s.sessionSeason.slice(1)
    : "Summer";
  const batchLabel = s.batchTime
    ? s.batchTime.charAt(0).toUpperCase() + s.batchTime.slice(1)
    : "Morning";

  const history: { label: string; score: number; wf: WaveformSegment[] }[] =
    attempts.length > 0
      ? attempts.map((a: AttemptResult, i: number) => ({
          label: i === 0 ? "Latest Attempt" : `Attempt #${attempts.length - i}`,
          score: Math.round((a.pronunciation + a.vocabulary + a.grammar) / 3),
          wf: a.waveform,
        }))
      : [0, 1, 2, 3].map((i: number) => ({
          label: i === 0 ? "Today" : `Week ${i + 1} ago`,
          score: Math.max(35, s.scorePct - i * 4),
          wf: makeSampleWaveform(s.name.length + i * 13, 48, 0.1 + i * 0.04),
        }));

  const sendParentReport = () => {
    const shareText = encodeURIComponent(
      `*Tarang Spoken-English Academic Report for ${s.name}*\n` +
        `Session & Batch: ${sessionLabel} Season · ${batchLabel} Batch\n` +
        `Current Score: ${s.scorePct}% (${s.trendPct >= 0 ? "+" : ""}${s.trendPct}%)\n` +
        `Homework Received: ${homeworkStats.totalReceived} | Completed: ${homeworkStats.completed} | Pending: ${homeworkStats.pending}\n` +
        `Focus Area: ${s.focus}\n` +
        `Last Active: ${s.lastActive}\n\n` +
        `Teacher Recommendation: Regular daily 5-minute speaking practice on Tarang.`,
    );
    window.open(`https://api.whatsapp.com/send?text=${shareText}`, "_blank", "noopener,noreferrer");
    setReportSent(true);
  };

  return (
    <TeacherShell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-[12px] text-secondary-warm hover:text-primary-warm"
      >
        <ArrowLeft size={14} />
        Back to console dashboard
      </Link>

      {/* Profile Header Dossier */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div className="flex items-center gap-4">
          <StatusDot status={s.status} className="size-3.5" />
          <div>
            <div className="flex items-center gap-2">
              <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
                complete student profile dossier
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#3FB8AF]">
                <Layers size={11} />
                {sessionLabel} · {batchLabel} Batch
              </span>
            </div>
            <h1 className="display mt-1 text-[30px] text-primary-warm">{s.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TButton
            variant="secondary"
            surface="console"
            size="sm"
            onClick={() => setMessageOpen(true)}
          >
            <MessageSquare size={14} />
            Direct Note
          </TButton>
          <TButton surface="console" size="sm" onClick={sendParentReport}>
            <Send size={14} />
            {reportSent ? "Report Sent" : "Share parent report"}
          </TButton>
        </div>
      </div>

      {/* Direct Message Modal */}
      <DirectNoteModal
        studentId={s.id}
        studentName={s.name}
        isOpen={messageOpen}
        onClose={() => setMessageOpen(false)}
      />

      {/* Top Metric Cards: Homework + Overall Signal */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              Homework Received
            </p>
            <BookOpen size={14} className="text-[#3FB8AF]" />
          </div>
          <p className="display num mt-2 text-[28px] text-primary-warm">
            {homeworkStats.totalReceived}
          </p>
          <p className="mt-1 text-[12px] text-secondary-warm">Total batch assignments</p>
        </div>

        <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              Homework Completed
            </p>
            <CheckCircle2 size={14} className="text-[#3FB8AF]" />
          </div>
          <p className="display num mt-2 text-[28px] text-[#3FB8AF]">{homeworkStats.completed}</p>
          <p className="mt-1 text-[12px] text-secondary-warm">Submitted recordings</p>
        </div>

        <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              Homework Pending
            </p>
            <Clock size={14} className="text-[#E2A33C]" />
          </div>
          <p className="display num mt-2 text-[28px] text-[#E2A33C]">{homeworkStats.pending}</p>
          <p className="mt-1 text-[12px] text-secondary-warm">Awaiting submission</p>
        </div>

        <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              Overall Fluency
            </p>
            <Award size={14} className="text-[#3FB8AF]" />
          </div>
          <p className="display num mt-2 text-[28px] text-primary-warm">{s.scorePct}%</p>
          <p className="mt-1 text-[12px] text-secondary-warm">
            {s.trendPct >= 0 ? "+" : ""}
            {s.trendPct}% vs last week
          </p>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.8fr_1fr]">
        {/* Left Column: Audio Recording & Transcript Evaluation Stream */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="display text-[20px] text-primary-warm">
                Student Audio Recordings & Transcripts
              </h2>
              <p className="text-[12px] text-secondary-warm">
                Listen to original audio responses and review exact verbatim transcripts for
                grading.
              </p>
            </div>
            <span className="num text-[12px] text-tertiary-warm">
              {attempts.length} recordings available
            </span>
          </div>

          {attempts.length === 0 ? (
            <div className="rounded-[12px] border border-hairline bg-ink-900 p-10 text-center text-secondary-warm">
              No audio attempts recorded yet by {s.name}.
            </div>
          ) : (
            <div className="space-y-5">
              {attempts.map((att: AttemptResult, idx: number) => (
                <AudioTranscriptEvaluator key={att.id || idx} attempt={att} index={idx} />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Historical Waveforms & Academic Profile */}
        <div className="space-y-6">
          {/* Signal Progression */}
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-5">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              historical waveform timeline
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[11px] text-secondary-warm truncate">
                    {h.label}
                  </span>
                  <div className="flex-1">
                    <Waveform mode="thumbnail" data={h.wf} height={20} />
                  </div>
                  <span className="num w-10 text-right text-[12px] text-primary-warm">
                    {h.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Academic Focus & Health */}
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-5 space-y-4">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Diagnostic Summary
            </p>

            <div>
              <span className="num text-[10px] uppercase text-tertiary-warm">Focus Area</span>
              <p className="mt-1 text-[17px] font-semibold text-[#E2A33C]">{s.focus}</p>
              <p className="mt-1 text-[12px] text-secondary-warm">
                {s.focus === "—"
                  ? "Acoustic signal is steady — maintain current practice schedule."
                  : `Targeted practice recommended in ${s.focus}.`}
              </p>
            </div>

            <div className="border-t border-hairline pt-3">
              <span className="num text-[10px] uppercase text-tertiary-warm">Activity Signal</span>
              <p className="num mt-1 text-[16px] text-primary-warm">{s.lastActive}</p>
              {s.inactiveDays && s.inactiveDays > 0 ? (
                <p className="num mt-0.5 text-[12px] text-alert-rust">
                  {s.inactiveDays} days since last recording
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}
