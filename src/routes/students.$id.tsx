import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  Award,
  RotateCcw,
  Check,
  FileText,
} from "lucide-react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
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
      instructions?: string;
      prompt?: string;
      difficulty: string;
      durationSec?: number;
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
      meta: [{ title: `${s?.name ?? "Student Profile"} · Trounce` }],
    };
  },
  component: StudentDetail,
});

function StudentDetail() {
  const profile = Route.useLoaderData() as unknown as StudentProfileData | null;
  const student = profile?.student ?? null;
  const rawAttempts = useMemo(() => profile?.attempts ?? [], [profile?.attempts]);
  const homeworkStats = profile?.homeworkStats ?? {
    totalReceived: 0,
    completed: 0,
    pending: 0,
    assignments: [],
  };

  const [activeTab, setActiveTab] = useState<"homework" | "retakes">("homework");
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>(
    homeworkStats.assignments[0]?.id ?? "",
  );
  const [selectedRetakeId, setSelectedRetakeId] = useState<string>("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const s: StudentRow = student ?? {
    id: "unknown",
    name: "Student",
    status: "on-track",
    focus: "General",
    lastActive: "Today",
    scorePct: 0,
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

  // Group attempts by homework (assignmentId) sorted newest-first (most recently recorded attempt first)
  const attemptsByHomework = useMemo(() => {
    const map = new Map<string, AttemptResult[]>();
    const sorted = [...rawAttempts].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    sorted.forEach((att) => {
      if (att.assignmentId) {
        const list = map.get(att.assignmentId) || [];
        list.push(att);
        map.set(att.assignmentId, list);
      }
    });
    return map;
  }, [rawAttempts]);

  // Selected homework object
  const currentHomework =
    homeworkStats.assignments.find((hw) => hw.id === selectedHomeworkId) ??
    homeworkStats.assignments[0];

  const currentHomeworkAttempts = currentHomework
    ? attemptsByHomework.get(currentHomework.id) || []
    : [];

  // Most recently recorded attempt (latest)
  const latestSubmission = currentHomeworkAttempts[0] || null;

  // Previous retakes (attempts recorded before the latest one)
  const retakeSubmissions = currentHomeworkAttempts.slice(1);

  // Active retake attempt for display
  const activeRetake =
    retakeSubmissions.find((r) => r.id === selectedRetakeId) || retakeSubmissions[0] || null;

  const sendParentReport = () => {
    const shareText = encodeURIComponent(
      `*Trounce Spoken-English Academic Report for ${s.name}*\n` +
        `Session & Batch: ${sessionLabel} Season · ${batchLabel} Batch\n` +
        `Current Score: ${s.scorePct}% (${s.trendPct >= 0 ? "+" : ""}${s.trendPct}%)\n` +
        `Homework Received: ${homeworkStats.totalReceived} | Completed: ${homeworkStats.completed} | Pending: ${homeworkStats.pending}\n` +
        `Focus Area: ${s.focus}\n` +
        `Last Active: ${s.lastActive}\n\n` +
        `Teacher Recommendation: Regular daily 5-minute speaking practice on Trounce.`,
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
            {s.trendPct}% vs previous attempt
          </p>
        </div>
      </div>

      {/* Main Switchable Tabs Navigation */}
      <div className="mt-10">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("homework")}
              className={`flex items-center gap-2 rounded-[8px] px-4 py-2 text-[14px] font-semibold transition cursor-pointer ${
                activeTab === "homework"
                  ? "bg-[#3FB8AF] text-[#100E0C] shadow-md shadow-[#3FB8AF]/20"
                  : "bg-ink-900 text-secondary-warm hover:text-primary-warm hover:bg-ink-800 border border-hairline"
              }`}
            >
              <BookOpen size={16} />
              Assigned Homework (Latest Submissions)
            </button>
            <button
              onClick={() => setActiveTab("retakes")}
              className={`flex items-center gap-2 rounded-[8px] px-4 py-2 text-[14px] font-semibold transition cursor-pointer ${
                activeTab === "retakes"
                  ? "bg-[#E2A33C] text-[#100E0C] shadow-md shadow-[#E2A33C]/20"
                  : "bg-ink-900 text-secondary-warm hover:text-primary-warm hover:bg-ink-800 border border-hairline"
              }`}
            >
              <RotateCcw size={16} />
              Retakes & History
            </button>
          </div>

          <span className="num text-[12px] text-tertiary-warm hidden sm:inline-block">
            {rawAttempts.length} total audio recordings
          </span>
        </div>

        {/* TAB 1: ASSIGNED HOMEWORK (LATEST SUBMISSION) */}
        {activeTab === "homework" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
            {/* Homework List Left Column */}
            <div className="space-y-3">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Assigned Homework List ({homeworkStats.assignments.length})
              </p>

              {homeworkStats.assignments.length === 0 ? (
                <div className="rounded-[12px] border border-hairline bg-ink-900 p-6 text-center text-secondary-warm text-[13px]">
                  No homework assignments configured for this batch.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {homeworkStats.assignments.map((hw) => {
                    const isSelected = hw.id === (currentHomework?.id ?? "");
                    const hwAttempts = attemptsByHomework.get(hw.id) || [];
                    const isDone = hwAttempts.length > 0;
                    const latest = hwAttempts[0];
                    const isDueValid = !!hw.dueDate && !isNaN(new Date(hw.dueDate).getTime());
                    const isLateSubmission =
                      isDone &&
                      latest?.createdAt &&
                      isDueValid &&
                      new Date(latest.createdAt).getTime() > new Date(hw.dueDate!).getTime();
                    const isOverduePending =
                      !isDone && isDueValid && Date.now() > new Date(hw.dueDate!).getTime();

                    const compScore =
                      isDone && latest && hw.durationSec && hw.durationSec > 0
                        ? Math.min(100, Math.round((latest.durationSec / hw.durationSec) * 100))
                        : null;

                    return (
                      <button
                        key={hw.id}
                        onClick={() => setSelectedHomeworkId(hw.id)}
                        className={`w-full text-left rounded-[12px] border p-3.5 transition cursor-pointer ${
                          isSelected
                            ? isLateSubmission || isOverduePending
                              ? "border-[#E2A33C] bg-ink-900 shadow-md ring-2 ring-[#E2A33C]/40"
                              : "border-[#3FB8AF] bg-ink-900 shadow-md ring-1 ring-[#3FB8AF]/30"
                            : isLateSubmission || isOverduePending
                              ? "border-[#E2A33C]/80 ring-1 ring-[#E2A33C]/30 bg-ink-900/80 hover:bg-ink-900 hover:border-[#E2A33C]"
                              : "border-hairline bg-ink-900/60 hover:bg-ink-900 hover:border-hairline"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`num text-[11px] uppercase tracking-wider ${isLateSubmission || isOverduePending ? "text-[#E2A33C]" : "text-[#3FB8AF]"}`}
                          >
                            {hw.difficulty} · {hw.durationSec || 60}s
                          </span>
                          {isDone ? (
                            isLateSubmission ? (
                              <span className="inline-flex items-center gap-1 rounded bg-[#E2A33C]/20 px-2 py-0.5 num text-[10px] font-semibold text-[#E2A33C]">
                                <Clock size={10} /> Late ·{" "}
                                {compScore !== null ? `${compScore}%` : "Done"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/20 px-2 py-0.5 num text-[10px] font-semibold text-[#3FB8AF]">
                                <Check size={10} /> Done
                                {compScore !== null ? ` · ${compScore}%` : ""}
                              </span>
                            )
                          ) : isOverduePending ? (
                            <span className="inline-flex items-center gap-1 rounded bg-[#E2A33C]/20 px-2 py-0.5 num text-[10px] font-semibold text-[#E2A33C]">
                              <Clock size={10} /> Overdue
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-ink-800 px-2 py-0.5 num text-[10px] font-medium text-tertiary-warm">
                              <Clock size={10} /> Pending
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 text-[14px] font-medium text-primary-warm line-clamp-1">
                          {hw.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-secondary-warm line-clamp-1 italic">
                          "{hw.prompt}"
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Latest Submission Detail Right Column */}
            <div className="space-y-4">
              {(() => {
                const isCurrentDueValid =
                  !!currentHomework?.dueDate && !isNaN(new Date(currentHomework.dueDate).getTime());
                const isCurrentSubmissionLate = Boolean(
                  latestSubmission?.createdAt &&
                  isCurrentDueValid &&
                  new Date(latestSubmission.createdAt).getTime() >
                    new Date(currentHomework.dueDate!).getTime(),
                );

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="display text-[18px] text-primary-warm">
                          {currentHomework ? currentHomework.title : "Select Homework"}
                        </h3>
                        <p className="text-[12px] text-secondary-warm">
                          Latest recording & submission by {s.name}.
                        </p>
                      </div>
                      {latestSubmission?.createdAt && (
                        <span className="num text-[12px] text-tertiary-warm">
                          Recorded: {new Date(latestSubmission.createdAt).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {isCurrentSubmissionLate && (
                      <div className="flex items-center gap-2 rounded-[8px] border border-[#E2A33C]/50 bg-[#E2A33C]/10 p-3 text-[12px] text-[#E2A33C]">
                        <Clock size={14} className="shrink-0" />
                        <span>
                          <strong>Late Submission:</strong> Recorded on{" "}
                          {new Date(latestSubmission!.createdAt!).toLocaleString()} (past deadline{" "}
                          {new Date(currentHomework.dueDate!).toLocaleString()}).
                        </span>
                      </div>
                    )}

                    {!currentHomework ? (
                      <div className="rounded-[12px] border border-hairline bg-ink-900 p-10 text-center text-secondary-warm">
                        Please select a homework assignment from the list.
                      </div>
                    ) : latestSubmission ? (
                      <AudioTranscriptEvaluator
                        attempt={latestSubmission}
                        index={0}
                        isLate={isCurrentSubmissionLate}
                      />
                    ) : (
                      <div className="rounded-[12px] border border-hairline bg-ink-900 p-10 text-center text-secondary-warm space-y-2">
                        <Clock size={32} className="mx-auto text-[#E2A33C] mb-2" />
                        <p className="text-[15px] font-medium text-primary-warm">
                          No submission recorded yet
                        </p>
                        <p className="text-[13px] text-secondary-warm max-w-sm mx-auto">
                          {s.name} has not yet recorded their response for "{currentHomework.title}
                          ".
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB 2: RETAKES */}
        {activeTab === "retakes" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
            {/* Homework List Left Column */}
            <div className="space-y-3">
              <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                Select Homework to View Retakes
              </p>

              {homeworkStats.assignments.length === 0 ? (
                <div className="rounded-[12px] border border-hairline bg-ink-900 p-6 text-center text-secondary-warm text-[13px]">
                  No homework assignments available.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {homeworkStats.assignments.map((hw) => {
                    const isSelected = hw.id === (currentHomework?.id ?? "");
                    const hwAttempts = attemptsByHomework.get(hw.id) || [];
                    const retakesCount = Math.max(0, hwAttempts.length - 1);

                    return (
                      <button
                        key={hw.id}
                        onClick={() => {
                          setSelectedHomeworkId(hw.id);
                          const hwRetakes = (attemptsByHomework.get(hw.id) || []).slice(1);
                          if (hwRetakes.length > 0) {
                            setSelectedRetakeId(hwRetakes[0].id);
                          }
                        }}
                        className={`w-full text-left rounded-[12px] border p-3.5 transition cursor-pointer ${
                          isSelected
                            ? "border-[#E2A33C] bg-ink-900 shadow-md ring-1 ring-[#E2A33C]/30"
                            : "border-hairline bg-ink-900/60 hover:bg-ink-900 hover:border-hairline"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                            {hw.difficulty}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 num text-[10px] font-semibold ${
                              retakesCount > 0
                                ? "bg-[#E2A33C]/20 text-[#E2A33C]"
                                : "bg-ink-800 text-tertiary-warm"
                            }`}
                          >
                            <RotateCcw size={10} />
                            {retakesCount} {retakesCount === 1 ? "Retake" : "Retakes"}
                          </span>
                        </div>

                        <p className="mt-1.5 text-[14px] font-medium text-primary-warm line-clamp-1">
                          {hw.title}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Retake Details Right Column */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="display text-[18px] text-primary-warm">
                    Retakes · {currentHomework ? currentHomework.title : "Select Homework"}
                  </h3>
                  <p className="text-[12px] text-secondary-warm">
                    {retakeSubmissions.length}{" "}
                    {retakeSubmissions.length === 1 ? "retake" : "retakes"} recorded prior to the
                    latest submission.
                  </p>
                </div>
              </div>

              {/* Retake Selection Pills */}
              {retakeSubmissions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-hairline bg-ink-950 p-2.5">
                  <span className="num text-[11px] uppercase tracking-wider text-tertiary-warm mr-1">
                    Select Retake:
                  </span>
                  {retakeSubmissions.map((retake, idx) => {
                    const isRetakeActive =
                      (activeRetake && activeRetake.id === retake.id) ||
                      (!activeRetake && idx === 0);
                    const compPct =
                      retake.targetDurationSec && retake.targetDurationSec > 0
                        ? Math.min(
                            100,
                            Math.round((retake.durationSec / retake.targetDurationSec) * 100),
                          )
                        : Math.round(
                            (retake.pronunciation + retake.vocabulary + retake.grammar) / 3,
                          );

                    return (
                      <button
                        key={retake.id || idx}
                        onClick={() => setSelectedRetakeId(retake.id)}
                        className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 num text-[12px] transition cursor-pointer ${
                          isRetakeActive
                            ? "bg-[#E2A33C] text-[#100E0C] font-semibold shadow-sm"
                            : "bg-ink-900 text-secondary-warm hover:text-primary-warm hover:bg-ink-800 border border-hairline"
                        }`}
                      >
                        <RotateCcw size={12} />
                        Attempt #{retakeSubmissions.length - idx}
                        <span className="opacity-80">· {compPct}%</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Retake Viewer */}
              {retakeSubmissions.length === 0 ? (
                <div className="rounded-[12px] border border-hairline bg-ink-900 p-10 text-center text-secondary-warm space-y-2">
                  <FileText size={32} className="mx-auto text-tertiary-warm mb-2" />
                  <p className="text-[15px] font-medium text-primary-warm">No retakes recorded</p>
                  <p className="text-[13px] text-secondary-warm max-w-sm mx-auto">
                    {latestSubmission
                      ? `${s.name} recorded their response and has not recorded any other retakes for this homework.`
                      : `${s.name} has not recorded any submissions for this homework yet.`}
                  </p>
                </div>
              ) : activeRetake ? (
                <AudioTranscriptEvaluator
                  attempt={activeRetake}
                  index={retakeSubmissions.findIndex((r) => r.id === activeRetake.id) + 1}
                  isLate={
                    !!currentHomework?.dueDate &&
                    !isNaN(new Date(currentHomework.dueDate).getTime()) &&
                    !!activeRetake.createdAt &&
                    new Date(activeRetake.createdAt).getTime() >
                      new Date(currentHomework.dueDate).getTime()
                  }
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
