import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { StudentShell } from "@/components/tarang/StudentShell";
import { Waveform } from "@/components/tarang/Waveform";
import {
  fetchModulesFn,
  fetchAssignmentsFn,
  fetchStudentMessagesFn,
  markMessageReadFn,
  fetchStudentAttemptsFn,
  sendDirectMessageFn,
} from "@/server/data";
import { useUser } from "@/lib/auth";
import { BookOpen, Calendar, Sparkles, MessageSquare, Check, Send, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/practice/")({
  head: () => ({
    meta: [
      { title: "Practice · Tarang" },
      {
        name: "description",
        content: "Pick a prompt and record. Tarang shows your signal.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    if (context.session.role !== "student" && !context.session.isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async ({ context }) => {
    const studentId = context.session?.userId;
    const studentSession = context.session?.sessionSeason;
    const studentBatch = context.session?.batchTime;
    const studentBatchId = context.session?.batchId;

    const [modules, assignments, messages, attempts] = await Promise.all([
      fetchModulesFn(),
      fetchAssignmentsFn({
        data: {
          session: studentSession,
          batch: studentBatch,
          batchId: studentBatchId,
        },
      }),
      studentId ? fetchStudentMessagesFn({ data: studentId }) : Promise.resolve([]),
      studentId ? fetchStudentAttemptsFn({ data: studentId }) : Promise.resolve([]),
    ]);
    return { modules, assignments, messages, attempts };
  },
  component: PracticeHub,
});

function PracticeHub() {
  return (
    <StudentShell>
      <PracticeHubBody />
    </StudentShell>
  );
}

function PracticeHubBody() {
  const { modules, assignments, messages, attempts } = Route.useLoaderData();
  const user = useUser();
  const router = useRouter();
  const firstName = user?.name.split(" ")[0] ?? "you";

  const [msgs, setMsgs] = useState(messages || []);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  // Count completed modules this week (real, from actual attempts)
  const completedModulesCount = useMemo(() => {
    const completedModIds = new Set(
      attempts?.filter((att) => att.moduleId).map((att) => att.moduleId),
    );
    return modules.filter((m) => completedModIds.has(m.id)).length;
  }, [modules, attempts]);

  // Count completed assignments this week (from actual attempts)
  const completedAssignmentsCount = useMemo(() => {
    const completedAssignIds = new Set(
      attempts?.filter((att) => att.assignmentId).map((att) => att.assignmentId),
    );
    return assignments.filter((a) => completedAssignIds.has(a.id)).length;
  }, [assignments, attempts]);

  // Total items to complete = actual assigned homework + available modules
  const totalCount = modules.length + assignments.length;
  const completedCount = completedModulesCount + completedAssignmentsCount;

  // Track FIRST (earliest) attempt per assignment — for submitted date display
  const attemptsByAssignment = useMemo(() => {
    const map = new Map<string, (typeof attempts)[0]>();
    // attempts are sorted newest-first from server, so iterate in reverse to keep earliest
    [...(attempts ?? [])].reverse().forEach((att) => {
      if (att.assignmentId) map.set(att.assignmentId, att);
    });
    return map;
  }, [attempts]);

  const attemptsByModule = useMemo(() => {
    const map = new Map<string, (typeof attempts)[0]>();
    [...(attempts ?? [])].reverse().forEach((att) => {
      if (att.moduleId) map.set(att.moduleId, att);
    });
    return map;
  }, [attempts]);

  // Calculate 7-day streak based on attempt timestamps with grace period
  const { streakDays, streakGraph } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const graph = [0, 0, 0, 0, 0, 0, 0];
    let streakCount = 0;

    if (attempts && attempts.length > 0) {
      // Map attempts to their midnight date timestamp to count unique days
      const activeDays = new Set(
        attempts.map((a) => {
          const d = new Date(a.createdAt || Date.now());
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }),
      );

      // Populate 7-day graph (index 6 is today, 5 is yesterday...)
      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() - (6 - i));
        if (activeDays.has(targetDate.getTime())) {
          graph[i] = 1;
        }
      }

      // Check if student recorded today
      const hasRecordedToday = activeDays.has(today.getTime());

      // If student hasn't recorded today yet, count backward from yesterday to preserve active streak
      const curr = new Date(today);
      if (!hasRecordedToday) {
        curr.setDate(curr.getDate() - 1);
      }

      while (activeDays.has(curr.getTime())) {
        streakCount++;
        curr.setDate(curr.getDate() - 1);
      }
    }

    return { streakDays: streakCount, streakGraph: graph };
  }, [attempts]);

  const handleMarkRead = async (messageId: string) => {
    try {
      await markMessageReadFn({ data: { messageId } });
      setMsgs((prev) => prev.map((m) => (m.id === messageId ? { ...m, read: true } : m)));
      router.invalidate();
    } catch (err) {
      console.error("Failed to mark message read", err);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !user || msgs.length === 0) return;

    // Send reply to the teacher of the most recent message
    const lastTeacherMsg = msgs.find((m) => m.senderRole !== "student");
    if (!lastTeacherMsg) return;

    setIsReplying(true);
    try {
      const newMsg = await sendDirectMessageFn({
        data: {
          studentId: user.userId,
          teacherId: lastTeacherMsg.teacherId,
          teacherName: lastTeacherMsg.teacherName,
          content: replyText.trim(),
          senderRole: "student",
        },
      });
      setMsgs([newMsg, ...msgs]);
      setReplyText("");
    } catch (err) {
      console.error("Failed to send reply", err);
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="px-5 pt-2 pb-10">
      {/* Hero streak — the one big number moment for students */}
      <div className="rounded-[12px] border border-hairline bg-ink-900 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-secondary-warm">Hi {firstName} — your streak</p>
            <p className="display mt-2 num text-[56px] leading-none text-primary-warm">
              {streakDays}
              <span className="ml-2 num text-[16px] font-normal text-tertiary-warm">days</span>
            </p>
          </div>
          <div className="text-right">
            <p className="num text-[12px] uppercase tracking-wider text-tertiary-warm">this week</p>
            <p className="num mt-1 text-[14px] text-secondary-warm">
              {completedCount} / {totalCount} completed
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {streakGraph.map((d, i) => (
            <div key={i} className={"h-1.5 rounded-full " + (d ? "bg-[#3FB8AF]" : "bg-ink-800")} />
          ))}
        </div>
      </div>

      {/* Teacher Notes / Direct Feedback Section */}
      {msgs.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-[#3FB8AF]" />
            <h2 className="display text-[18px] text-primary-warm">Teacher Notes</h2>
            {msgs.filter((m) => !m.read).length > 0 && (
              <span className="ml-2 flex size-5 items-center justify-center rounded-full bg-[#3FB8AF] num text-[10px] font-bold text-[#100E0C]">
                {msgs.filter((m) => !m.read).length}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`relative overflow-hidden rounded-[12px] border p-4 transition ${
                  m.read || m.senderRole === "student"
                    ? "border-hairline bg-ink-900 opacity-70"
                    : "border-[#3FB8AF]/40 bg-ink-900 shadow-[0_0_15px_rgba(63,184,175,0.1)]"
                } ${m.senderRole === "student" ? "ml-8 border-r-[#E2A33C]/40" : "mr-8"}`}
              >
                {!m.read && m.senderRole !== "student" && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-[#3FB8AF]" />
                )}

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-primary-warm">
                        {m.senderRole === "student" ? "You" : m.teacherName}
                      </span>
                      <span className="num text-[11px] text-tertiary-warm">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-secondary-warm whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>

                  {!m.read && m.senderRole !== "student" && (
                    <button
                      onClick={() => handleMarkRead(m.id)}
                      className="shrink-0 rounded-[4px] border border-[#3FB8AF]/30 bg-[#3FB8AF]/10 px-2 py-1 text-[11px] font-medium text-[#3FB8AF] transition hover:bg-[#3FB8AF]/20 flex items-center gap-1"
                    >
                      <Check size={12} /> Mark Read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {msgs.some((m) => m.senderRole !== "student") && (
            <form onSubmit={handleReply} className="mt-4 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to teacher..."
                className="flex-1 rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isReplying || !replyText.trim()}
                className="flex items-center gap-2 rounded-[8px] bg-[#3FB8AF] px-4 text-[13px] font-medium text-ink-950 transition hover:bg-[#349e96] disabled:opacity-50"
              >
                <Send size={14} />
                Send
              </button>
            </form>
          )}
        </div>
      )}

      {/* Assigned Homework Section */}
      {assignments && assignments.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#3FB8AF]" />
              <h2 className="display text-[18px] text-primary-warm">Assigned Homework</h2>
            </div>
            <span className="num text-[11px] rounded-[6px] bg-[#3FB8AF]/20 px-2 py-0.5 font-medium text-[#3FB8AF]">
              {assignments.length} assigned
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {assignments.map((a) => {
              const isDueValid = !!a.dueDate && !isNaN(new Date(a.dueDate).getTime());
              const isLate = isDueValid ? new Date(a.dueDate!).getTime() < Date.now() : false;
              const dueDateFormatted = isDueValid
                ? new Date(a.dueDate!).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Not set";

              const submission = attemptsByAssignment.get(a.id);
              const isDone = !!submission;

              // Completion % = how much of the target duration the student recorded, capped at 100%
              const completionPct =
                isDone && submission && a.durationSec > 0
                  ? Math.min(100, Math.round((submission.durationSec / a.durationSec) * 100))
                  : null;

              // First submission date from createdAt (attempts are sorted earliest-first in map)
              const submittedDateFormatted =
                isDone && submission?.createdAt
                  ? new Date(submission.createdAt).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : null;

              return (
                <div
                  key={a.id}
                  className={`rounded-[12px] border p-4 transition ${
                    isDone
                      ? "border-[#3FB8AF]/50 bg-ink-900 shadow-sm"
                      : isLate
                        ? "border-[#E2A33C] ring-1 ring-[#E2A33C]/40 bg-ink-900/95 shadow-md shadow-[#E2A33C]/10"
                        : "border-[#3FB8AF]/30 bg-ink-900/90 hover:border-[#3FB8AF]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`num text-[11px] uppercase tracking-wider ${isLate && !isDone ? "text-[#E2A33C]" : "text-[#3FB8AF]"}`}
                      >
                        {a.targetSession} · {a.targetBatch} batch
                      </span>
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/20 px-2 py-0.5 num text-[11px] font-semibold text-[#3FB8AF]">
                          <Check size={11} /> Done
                          {completionPct !== null ? ` · ${completionPct}%` : ""}
                        </span>
                      ) : isLate ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[#E2A33C]/20 px-2 py-0.5 num text-[11px] font-semibold text-[#E2A33C]">
                          <Clock size={11} /> Overdue
                        </span>
                      ) : null}
                    </div>
                    <span className="num text-[11px] text-tertiary-warm">
                      {a.difficulty} · {a.durationSec}s
                    </span>
                  </div>

                  <h3 className="display mt-1.5 text-[16px] text-primary-warm">{a.title}</h3>
                  <p className="mt-1 text-[12px] text-secondary-warm">{a.instructions}</p>

                  <div className="mt-3 rounded-[8px] border border-hairline bg-ink-950/80 p-3">
                    <p className="num text-[10px] uppercase tracking-wider text-tertiary-warm">
                      Prompt
                    </p>
                    <p className="mt-1 text-[13px] text-primary-warm italic">"{a.prompt}"</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2 text-[12px]">
                    <span
                      className={`flex items-center gap-1.5 ${isLate && !isDone ? "text-[#E2A33C] font-medium" : "text-tertiary-warm"}`}
                    >
                      <Calendar size={13} />
                      {isDone
                        ? submittedDateFormatted
                          ? `Submitted ${submittedDateFormatted}`
                          : "Submitted"
                        : isLate
                          ? `Past Due: ${dueDateFormatted}`
                          : `Due: ${dueDateFormatted}`}
                    </span>

                    <Link
                      to="/practice/assignment/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className={`inline-flex items-center gap-1.5 font-medium hover:underline ${
                        isDone ? "text-[#3FB8AF]" : isLate ? "text-[#E2A33C]" : "text-[#3FB8AF]"
                      }`}
                    >
                      <Sparkles size={13} />
                      {isDone
                        ? "Listen & Review (or Retake) →"
                        : isLate
                          ? "Record Homework (Late Submission) →"
                          : "Record Homework →"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily Standard Curriculum Prompts */}
      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="display text-[18px]">Daily curriculum drills</h2>
        <span className="num text-[12px] text-tertiary-warm">{modules.length} available</span>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {modules.map((m) => {
          const modSubmission = attemptsByModule.get(m.id);
          const isDone = !!modSubmission;
          // Completion % = how much of the target duration the student recorded, capped at 100%
          const completionPct =
            isDone && modSubmission && m.durationSec > 0
              ? Math.min(100, Math.round((modSubmission.durationSec / m.durationSec) * 100))
              : null;

          return (
            <li key={m.id}>
              <Link
                to="/practice/$moduleId"
                params={{ moduleId: m.id }}
                className={`group block rounded-[12px] border p-4 transition ${
                  isDone
                    ? "border-[#3FB8AF]/30 bg-ink-900 hover:border-[#3FB8AF]"
                    : "border-hairline bg-ink-900 hover:border-[#9C9388]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] text-primary-warm">{m.title}</p>
                      {isDone && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/15 px-2 py-0.5 num text-[10px] font-semibold text-[#3FB8AF]">
                          <Check size={10} /> Done
                          {completionPct !== null ? ` · ${completionPct}%` : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-secondary-warm">
                      {m.difficulty} · {m.durationSec}s
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isDone ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 opacity-80">
                          <Waveform
                            mode="thumbnail"
                            data={
                              modSubmission?.waveform && modSubmission.waveform.length > 0
                                ? modSubmission.waveform
                                : Array.from({ length: 22 }, (_, i) => ({
                                    v: 0.3 + Math.abs(Math.sin((i + m.id.length) * 0.7)) * 0.5,
                                    kind: "clear" as const,
                                  }))
                            }
                            height={22}
                          />
                        </div>
                        <span className="num text-[11px] text-[#3FB8AF] group-hover:underline">
                          Review →
                        </span>
                      </div>
                    ) : (
                      <span className="num text-[11px] uppercase tracking-wider text-[#3FB8AF]">
                        start →
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
