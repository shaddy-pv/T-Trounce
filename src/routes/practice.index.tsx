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
import { cachedClientFetch } from "@/lib/client-cache";
import { useUser } from "@/lib/auth";
import {
  BookOpen,
  Calendar,
  Mic,
  MessageSquare,
  Check,
  Send,
  Clock,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/practice/")({
  head: () => ({
    meta: [
      { title: "Practice · Trounce" },
      {
        name: "description",
        content: "Pick a prompt and record. Trounce shows your signal.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    if (
      context.session.role !== "student" &&
      !context.session.isAdmin &&
      context.session.role !== "admin"
    ) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async ({ context }) => {
    const studentId = context.session?.userId;
    const studentSession = context.session?.sessionSeason;
    const studentBatch = context.session?.batchTime;
    const studentBatchId = context.session?.batchId;

    const [modules, assignments, messages, attempts] = await Promise.all([
      cachedClientFetch("modules", () => fetchModulesFn()),
      cachedClientFetch(
        `student-assignments-${studentSession}-${studentBatch}-${studentBatchId}`,
        () =>
          fetchAssignmentsFn({
            data: {
              session: studentSession,
              batch: studentBatch,
              batchId: studentBatchId,
            },
          }),
      ),
      studentId
        ? cachedClientFetch(`student-messages-${studentId}`, () =>
            fetchStudentMessagesFn({ data: studentId }),
          )
        : Promise.resolve([]),
      studentId
        ? cachedClientFetch(`student-attempts-${studentId}`, () =>
            fetchStudentAttemptsFn({ data: studentId }),
          )
        : Promise.resolve([]),
    ]);
    return { modules, assignments, messages, attempts };
  },
  pendingComponent: PracticeHubSkeleton,
  component: PracticeHub,
});

function PracticeHubSkeleton() {
  return (
    <StudentShell>
      <div className="space-y-6 px-5 py-6 animate-pulse">
        <div className="h-6 w-32 bg-ink-900 rounded" />
        <div className="h-44 bg-ink-900 rounded-[12px] border border-hairline" />
        <div className="h-32 bg-ink-900 rounded-[12px] border border-hairline" />
        <div className="h-32 bg-ink-900 rounded-[12px] border border-hairline" />
      </div>
    </StudentShell>
  );
}

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

  const hasRecordedToday = streakGraph[6] === 1;
  const { t } = useLanguage();

  return (
    <div className="px-5 pt-2 pb-10">
      {/* Hero streak — the one big number moment for students */}
      <div className="rounded-[14px] border border-hairline bg-ink-900 p-5 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-secondary-warm font-medium">
              {t("greeting_streak", { name: firstName })}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="display num text-[56px] leading-none text-primary-warm font-bold">
                {streakDays}
              </p>
              <span className="num text-[16px] font-semibold text-[#3FB8AF] light:text-teal-700">
                {t("days_count")}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
              {t("this_week")}
            </p>
            <p className="num mt-1 text-[14px] font-semibold text-primary-warm">
              {t("completed_of", { completed: completedCount, total: totalCount })}
            </p>
          </div>
        </div>

        {/* Motivation note */}
        <div
          className={`mt-3 text-[12px] rounded-lg px-3 py-1.5 border transition ${
            hasRecordedToday
              ? "bg-ink-950/70 border-hairline/60 light:bg-teal-50 light:border-teal-200"
              : "bg-ink-950/70 border-hairline/60 light:bg-amber-50 light:border-amber-200"
          }`}
        >
          {hasRecordedToday ? (
            <span className="text-[#3FB8AF] light:text-teal-800 font-medium">
              {t("streak_done_msg")}
            </span>
          ) : (
            <span className="text-[#E2A33C] light:text-amber-800 font-medium">
              {t("streak_pending_msg")}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {streakGraph.map((d, i) => (
            <div
              key={i}
              className={
                "h-2 rounded-full transition-all " +
                (d ? "bg-[#3FB8AF] shadow-[0_0_6px_#3FB8AF]" : "bg-ink-800")
              }
              title={i === 6 ? "Today" : `${6 - i} days ago`}
            />
          ))}
        </div>
      </div>

      {/* Teacher Notes / Direct Feedback Section */}
      {msgs.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={17} className="text-[#3FB8AF]" />
            <h2 className="display text-[18px] text-primary-warm font-medium">
              {t("teacher_notes_title")}
            </h2>
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
              <BookOpen size={18} className="text-[#3FB8AF] light:text-teal-700" />
              <h2 className="display text-[18px] text-primary-warm font-medium">
                {t("assigned_homework_title")}
              </h2>
            </div>
            <span className="num text-[11px] rounded-full bg-[#3FB8AF]/20 px-2.5 py-0.5 font-semibold text-[#3FB8AF] light:bg-teal-100/90 light:text-teal-800 light:border light:border-teal-200">
              {t("tasks_count", { count: assignments.length })}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {assignments.map((a) => {
              const isDueValid = !!a.dueDate && !isNaN(new Date(a.dueDate).getTime());
              const isLate = isDueValid ? new Date(a.dueDate!).getTime() < Date.now() : false;
              const dueDateFormatted = isDueValid
                ? new Date(a.dueDate!).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : a.dueDate || "Not set";

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
                  ? new Date(submission.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : null;

              return (
                <div
                  key={a.id}
                  className={`rounded-[14px] border p-4 transition shadow-sm ${
                    isDone
                      ? "border-[#3FB8AF]/40 bg-ink-900 hover:border-[#3FB8AF] light:border-slate-200 light:hover:border-teal-600"
                      : isLate
                        ? "border-[#E2A33C] ring-1 ring-[#E2A33C]/40 bg-ink-900 hover:border-[#E2A33C] light:border-amber-300 light:ring-amber-200"
                        : "border-[#3FB8AF]/30 bg-ink-900 hover:border-[#3FB8AF] light:border-slate-200 light:hover:border-teal-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="num text-[11px] font-semibold text-tertiary-warm">
                      {a.difficulty} · {a.durationSec}s
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3FB8AF]/40 bg-[#3FB8AF]/20 px-2.5 py-0.5 num text-[11px] font-semibold text-[#3FB8AF] light:border-teal-300 light:bg-teal-50 light:text-teal-800 whitespace-nowrap shrink-0">
                          <Check size={12} className="shrink-0" />
                          <span>{t("status_done")}</span>
                          {completionPct !== null && (
                            <span className="opacity-90 font-bold">({completionPct}%)</span>
                          )}
                        </span>
                      ) : isLate ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2A33C]/40 bg-[#E2A33C]/20 px-2.5 py-0.5 num text-[11px] font-semibold text-[#E2A33C] light:border-amber-300 light:bg-amber-50 light:text-amber-800 whitespace-nowrap shrink-0">
                          <Clock size={12} className="shrink-0" /> {t("status_late")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-ink-950 px-2.5 py-0.5 num text-[11px] font-medium text-secondary-warm whitespace-nowrap shrink-0">
                          ⏱️ {t("status_pending")}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="display mt-2 text-[16px] text-primary-warm font-medium">
                    <Link
                      to="/practice/assignment/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className="hover:text-[#3FB8AF] light:hover:text-teal-700 transition"
                    >
                      {a.title}
                    </Link>
                  </h3>
                  {(a.instructions || a.prompt) && (
                    <p className="mt-1 text-[13px] text-secondary-warm line-clamp-2">
                      {a.instructions || a.prompt}
                    </p>
                  )}

                  <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-hairline pt-3 text-[12px]">
                    <span
                      className={`flex items-center gap-1.5 ${isLate && !isDone ? "text-[#E2A33C] light:text-amber-800 font-medium" : "text-tertiary-warm"}`}
                    >
                      <Calendar size={13} className="shrink-0" />
                      {isDone
                        ? submittedDateFormatted
                          ? `Submitted: ${submittedDateFormatted}`
                          : t("status_submitted")
                        : isLate
                          ? t("due_date_passed", { date: dueDateFormatted })
                          : t("due_date", { date: dueDateFormatted })}
                    </span>

                    <Link
                      to="/practice/assignment/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[12.5px] font-semibold transition shrink-0 ${
                        isDone
                          ? "border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 text-[#3FB8AF] hover:bg-[#3FB8AF]/25 light:border-teal-300 light:bg-teal-50 light:text-teal-800 light:hover:bg-teal-100/90 light:shadow-xs"
                          : isLate
                            ? "bg-[#E2A33C] text-ink-950 hover:brightness-110 shadow-md shadow-[#E2A33C]/20 light:bg-[#D97706] light:text-white light:hover:bg-[#B45309]"
                            : "bg-[#3FB8AF] text-ink-950 hover:brightness-110 shadow-md shadow-[#3FB8AF]/20 light:bg-[#0D9488] light:text-white light:hover:bg-[#0F766E]"
                      }`}
                    >
                      <Mic size={14} />
                      {isDone ? t("listen_or_retake_btn") : t("record_homework_btn")}
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
        <div>
          <h2 className="display text-[18px] text-primary-warm font-medium">
            {t("practice_drills_title")}
          </h2>
          <p className="text-[12px] text-secondary-warm mt-0.5">{t("practice_drills_sub")}</p>
        </div>
        <span className="num text-[11px] rounded-full bg-ink-800 px-2 py-0.5 text-secondary-warm">
          {t("available_count", { count: modules.length })}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {modules.map((m) => {
          const modSubmission = attemptsByModule.get(m.id);
          const isDone = !!modSubmission;
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
                    ? "border-[#3FB8AF]/40 bg-ink-900 hover:border-[#3FB8AF] light:border-slate-200 light:hover:border-teal-600"
                    : "border-hairline bg-ink-900 hover:border-[#3FB8AF]/60 light:border-slate-200 light:hover:border-teal-600"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-primary-warm truncate transition group-hover:text-[#3FB8AF] light:group-hover:text-teal-700">
                      {m.title}
                    </p>
                    <p className="mt-1 num text-[12px] text-tertiary-warm">
                      {m.difficulty} · {m.durationSec}s
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2.5">
                    {isDone ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 px-2.5 py-0.5 num text-[11px] font-semibold text-[#3FB8AF] light:border-teal-300 light:bg-teal-50 light:text-teal-800 whitespace-nowrap">
                        <Check size={11} className="shrink-0" />
                        <span>{t("status_done")}</span>
                        {completionPct !== null && (
                          <span className="opacity-90 font-bold">({completionPct}%)</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#3FB8AF]/15 px-3 py-1.5 text-[12px] font-semibold text-[#3FB8AF] light:border light:border-teal-300 light:bg-teal-50 light:text-teal-800 group-hover:bg-[#3FB8AF] group-hover:text-ink-950 light:group-hover:bg-[#0D9488] light:group-hover:text-white light:group-hover:border-[#0D9488] transition whitespace-nowrap">
                        <Mic size={13} className="shrink-0" />
                        <span>{t("speak_action")}</span>
                      </span>
                    )}

                    <ChevronRight
                      size={15}
                      className="text-tertiary-warm transition group-hover:text-[#3FB8AF] light:group-hover:text-teal-700 group-hover:translate-x-0.5 shrink-0"
                    />
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
