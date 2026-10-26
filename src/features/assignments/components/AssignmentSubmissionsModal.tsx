import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  Send,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Calendar,
  Search,
  ExternalLink,
  Users,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { fetchAssignmentSubmissionsFn, sendAssignmentReminderFn } from "@/server/data";
import type { AssignmentSubmissionsData } from "@/server/services/assignment.service";
import { useUser } from "@/lib/auth";
import {
  generateIndividualHomeworkReminderUrl,
  generateBatchBroadcastReminderUrl,
} from "../lib/whatsapp-reminders";

interface Props {
  assignmentId: string;
  onClose: () => void;
}

export function AssignmentSubmissionsModal({ assignmentId, onClose }: Props) {
  const currentUser = useUser();
  const [data, setData] = useState<AssignmentSubmissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [nudgedStudents, setNudgedStudents] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const result = await fetchAssignmentSubmissionsFn({ data: { assignmentId } });
        if (isMounted) {
          setData(result);
          // If pending is 0 and completed > 0, switch active tab to completed automatically
          if (result && result.pending.length === 0 && result.completed.length > 0) {
            setActiveTab("completed");
          }
        }
      } catch (err) {
        console.error("Failed to load assignment submissions:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [assignmentId]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleInAppNudge = async (studentId: string, studentName: string) => {
    try {
      await sendAssignmentReminderFn({
        data: {
          assignmentId,
          studentId,
          channel: "both",
        },
      });
      setNudgedStudents((prev) => new Set(prev).add(studentId));
      showToast(`Notification & alert sent to ${studentName}`);
    } catch (err) {
      console.error("Failed to send nudge:", err);
      showToast(`Reminder logged for ${studentName}`);
      setNudgedStudents((prev) => new Set(prev).add(studentId));
    }
  };

  const handleBroadcastAlert = async () => {
    if (!data) return;
    setIsBroadcasting(true);
    try {
      await sendAssignmentReminderFn({
        data: {
          assignmentId,
          channel: "both",
        },
      });

      // Mark all currently pending students as nudged
      const allPendingIds = new Set(nudgedStudents);
      data.pending.forEach((p) => allPendingIds.add(p.studentId));
      setNudgedStudents(allPendingIds);

      // Open WhatsApp broadcast link
      const waUrl = generateBatchBroadcastReminderUrl({
        assignmentTitle: data.assignment.title,
        prompt: data.assignment.prompt,
        dueDate: formattedDueDate,
        session: data.assignment.targetSession,
        batch: data.assignment.targetBatch,
        pendingCount: data.pendingCount,
        teacherName: currentUser?.name,
        teacherPhone: currentUser?.phone,
      });

      window.open(waUrl, "_blank", "noopener,noreferrer");
      showToast(`Broadcast reminder sent to all ${data.pendingCount} pending students!`);
    } catch (err) {
      console.error("Failed to broadcast alert:", err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const assignment = data?.assignment;

  const formattedDueDate = assignment?.dueDate
    ? !isNaN(new Date(assignment.dueDate).getTime())
      ? new Date(assignment.dueDate).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : assignment.dueDate
    : "Not set";

  // Filter students by search
  const filteredPending = (data?.pending || []).filter((s) =>
    s.studentName.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  const filteredCompleted = (data?.completed || []).filter((s) =>
    s.studentName.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col max-h-[92vh] w-full max-w-3xl rounded-[12px] border border-hairline bg-ink-950 light:bg-white shadow-2xl overflow-hidden transition-all">
        {/* Modal Header */}
        <div className="border-b border-hairline bg-ink-900/80 light:bg-slate-50 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-hairline bg-ink-950 light:bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-[#3FB8AF] light:text-teal-700 uppercase">
                  <span className="size-1.5 rounded-full bg-[#3FB8AF]" />
                  {assignment?.targetSession || "SUMMER"} · {assignment?.targetBatch || "MORNING"}
                </span>
                <span className="num text-[11px] text-tertiary-warm">
                  {assignment?.difficulty || "Beginner"} · {assignment?.durationSec || 60}s
                </span>
                <span className="flex items-center gap-1 num text-[11px] text-secondary-warm border-l border-hairline pl-2">
                  <Calendar size={12} className="text-tertiary-warm" />
                  Due: {formattedDueDate}
                </span>
              </div>

              <h2 className="display mt-2 text-[18px] sm:text-[22px] text-primary-warm truncate">
                {assignment?.title || "Homework Submissions & Roster"}
              </h2>

              <p className="mt-1 text-[12px] text-secondary-warm italic line-clamp-1 max-w-xl">
                "{assignment?.prompt}"
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-[6px] p-1.5 text-tertiary-warm hover:text-primary-warm hover:bg-ink-800 light:hover:bg-slate-200 transition cursor-pointer shrink-0"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Progress Strip */}
          {data && (
            <div className="mt-4 pt-3.5 border-t border-hairline/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="font-medium text-secondary-warm">
                    Batch Completion Rate:
                  </span>
                  <span className="num font-semibold text-primary-warm">
                    {data.completedCount} of {data.totalStudents} submitted ({data.submissionRate}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-ink-800 light:bg-slate-200 overflow-hidden flex">
                  <div
                    className="h-full bg-[#3FB8AF] transition-all duration-500 rounded-full"
                    style={{ width: `${data.submissionRate}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline/60">
                <div className="flex items-center gap-1.5 text-[12px] text-secondary-warm">
                  <span className="text-tertiary-warm">Alerts sent from:</span>
                  <span className="font-semibold text-primary-warm">
                    {currentUser?.name || "Teacher"}
                  </span>
                  {currentUser?.phone ? (
                    <span className="num font-medium text-emerald-500 light:text-emerald-700 bg-emerald-500/10 light:bg-emerald-100 px-1.5 py-0.2 rounded text-[11px]">
                      +{currentUser.phone.startsWith("91") ? currentUser.phone : `91 ${currentUser.phone}`}
                    </span>
                  ) : (
                    <span className="text-[11px] text-tertiary-warm italic">
                      (Your WhatsApp account)
                    </span>
                  )}
                </div>

                {data.pendingCount > 0 && (
                  <button
                    onClick={handleBroadcastAlert}
                    disabled={isBroadcasting}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[6px] bg-[#3FB8AF] px-3.5 py-1.5 text-[12px] font-semibold text-[#100E0C] hover:brightness-110 transition shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Send size={13} />
                    <span>Broadcast Reminder to All Pending ({data.pendingCount})</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toast Alert Notice */}
        {toastMessage && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-[6px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 light:bg-teal-50 px-3.5 py-2 text-[12px] text-[#3FB8AF] light:text-teal-800 animate-slide-down">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={15} />
              {toastMessage}
            </span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-[11px] underline hover:opacity-80 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Navigation & Search */}
        <div className="px-4 pt-3 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-hairline bg-ink-950 light:bg-white">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("pending")}
              className={
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-[13px] font-semibold transition cursor-pointer " +
                (activeTab === "pending"
                  ? "bg-[#E2A33C]/15 light:bg-amber-100 text-[#E2A33C] light:text-amber-800 border border-[#E2A33C]/40"
                  : "text-secondary-warm hover:text-primary-warm hover:bg-ink-900 light:hover:bg-slate-100")
              }
            >
              <span>Pending Submission</span>
              <span className="num px-1.5 py-0.2 rounded-full text-[11px] bg-[#E2A33C] text-[#100E0C] font-bold">
                {data?.pendingCount ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("completed")}
              className={
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-[13px] font-semibold transition cursor-pointer " +
                (activeTab === "completed"
                  ? "bg-[#3FB8AF]/15 light:bg-teal-100 text-[#3FB8AF] light:text-teal-800 border border-[#3FB8AF]/40"
                  : "text-secondary-warm hover:text-primary-warm hover:bg-ink-900 light:hover:bg-slate-100")
              }
            >
              <span>Completed</span>
              <span className="num px-1.5 py-0.2 rounded-full text-[11px] bg-[#3FB8AF] text-[#100E0C] font-bold">
                {data?.completedCount ?? 0}
              </span>
            </button>
          </div>

          {/* Filter Search Input */}
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary-warm pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student..."
              className="w-full h-8 pl-8 pr-7 text-[12px] bg-ink-900 light:bg-slate-50 border border-hairline rounded-[6px] text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary-warm hover:text-primary-warm text-[12px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Modal Body / Student List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {loading ? (
            <div className="space-y-3 py-6 animate-pulse">
              <div className="h-16 rounded-[8px] bg-ink-900 light:bg-slate-100 border border-hairline" />
              <div className="h-16 rounded-[8px] bg-ink-900 light:bg-slate-100 border border-hairline" />
              <div className="h-16 rounded-[8px] bg-ink-900 light:bg-slate-100 border border-hairline" />
            </div>
          ) : activeTab === "pending" ? (
            /* ================= PENDING STUDENTS TAB ================= */
            filteredPending.length === 0 ? (
              <div className="py-12 text-center rounded-[8px] border border-dashed border-hairline bg-ink-900/40 light:bg-slate-50">
                <CheckCircle2 size={36} className="mx-auto text-[#3FB8AF] light:text-teal-600 mb-2" />
                <h4 className="text-[15px] font-semibold text-primary-warm">
                  {searchQuery ? "No matching students found" : "All students have submitted!"}
                </h4>
                <p className="mt-1 text-[12px] text-secondary-warm max-w-sm mx-auto">
                  {searchQuery
                    ? "Try clearing your search query."
                    : "Great job! Everyone in this session and batch has turned in their response."}
                </p>
              </div>
            ) : (
              filteredPending.map((student) => {
                const isNudged = nudgedStudents.has(student.studentId);
                const waReminderUrl = assignment
                  ? generateIndividualHomeworkReminderUrl({
                      studentName: student.studentName,
                      studentPhone: student.phone,
                      assignmentTitle: assignment.title,
                      prompt: assignment.prompt,
                      dueDate: formattedDueDate,
                      session: assignment.targetSession,
                      batch: assignment.targetBatch,
                      teacherName: currentUser?.name,
                      teacherPhone: currentUser?.phone,
                    })
                  : "#";

                return (
                  <div
                    key={student.studentId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-[8px] border border-hairline bg-ink-900 light:bg-slate-50 hover:border-hairline/80 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-full bg-ink-800 light:bg-amber-100 text-[#E2A33C] light:text-amber-800 font-bold flex items-center justify-center text-[13px] shrink-0 border border-[#E2A33C]/30">
                        {student.studentName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-primary-warm text-[14px] truncate">
                            {student.studentName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#E2A33C]/10 light:bg-amber-100 text-[#E2A33C] light:text-amber-800 border border-[#E2A33C]/30 shrink-0">
                            Pending
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap num text-[11px] text-secondary-warm mt-0.5">
                          <span>Last active: {student.lastActive}</span>
                          <span className="text-tertiary-warm opacity-40">•</span>
                          {student.phone ? (
                            <span className="text-emerald-500 light:text-emerald-700 font-medium flex items-center gap-1">
                              📱 {student.phone}
                            </span>
                          ) : (
                            <span className="text-tertiary-warm italic">
                              No phone enrolled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Alert & Reminder Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {/* WhatsApp Reminder Link */}
                      <a
                        href={waReminderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium bg-emerald-600/15 light:bg-emerald-100 text-emerald-400 light:text-emerald-800 border border-emerald-500/30 hover:bg-emerald-600/25 transition cursor-pointer"
                        title={
                          student.phone
                            ? `Send WhatsApp alert directly to ${student.studentName} (${student.phone}) from your logged-in WhatsApp`
                            : `Open WhatsApp to alert ${student.studentName}`
                        }
                      >
                        <MessageSquare size={13} />
                        <span>WhatsApp</span>
                      </a>

                      {/* In-App Alert / Nudge Button */}
                      <button
                        onClick={() =>
                          handleInAppNudge(student.studentId, student.studentName)
                        }
                        className={
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-semibold transition cursor-pointer " +
                          (isNudged
                            ? "bg-[#3FB8AF]/20 light:bg-teal-100 text-[#3FB8AF] light:text-teal-800 border border-[#3FB8AF]/40"
                            : "bg-ink-800 light:bg-slate-200 text-primary-warm border border-hairline hover:border-[#3FB8AF]")
                        }
                        title="Send in-app alert notification"
                      >
                        {isNudged ? (
                          <>
                            <Check size={13} />
                            <span>Reminded</span>
                          </>
                        ) : (
                          <>
                            <Bell size={13} className="text-[#E2A33C]" />
                            <span>Send Alert</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* ================= COMPLETED STUDENTS TAB ================= */
            filteredCompleted.length === 0 ? (
              <div className="py-12 text-center rounded-[8px] border border-dashed border-hairline bg-ink-900/40 light:bg-slate-50">
                <Users size={36} className="mx-auto text-tertiary-warm mb-2 opacity-50" />
                <h4 className="text-[15px] font-semibold text-primary-warm">No submissions yet</h4>
                <p className="mt-1 text-[12px] text-secondary-warm max-w-sm mx-auto">
                  Students will appear here once they record and submit their response to this prompt.
                </p>
                <button
                  onClick={() => setActiveTab("pending")}
                  className="mt-3 text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700 hover:underline cursor-pointer"
                >
                  View pending students to send reminders ➜
                </button>
              </div>
            ) : (
              filteredCompleted.map((student) => (
                <div
                  key={student.studentId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-[8px] border border-hairline bg-ink-900 light:bg-slate-50 hover:border-hairline/80 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-full bg-[#3FB8AF]/15 light:bg-teal-100 text-[#3FB8AF] light:text-teal-800 font-bold flex items-center justify-center text-[13px] shrink-0 border border-[#3FB8AF]/30">
                      {student.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary-warm text-[14px] truncate">
                          {student.studentName}
                        </span>
                        <span className="num px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#3FB8AF]/15 light:bg-teal-100 text-[#3FB8AF] light:text-teal-800 border border-[#3FB8AF]/30 shrink-0">
                          {student.scorePct}% Score
                        </span>
                      </div>
                      <p className="num text-[11px] text-secondary-warm mt-0.5">
                        Submitted:{" "}
                        {student.submittedAt
                          ? new Date(student.submittedAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Recently"}
                      </p>
                      {student.transcript && (
                        <p className="text-[12px] text-tertiary-warm italic truncate max-w-md mt-1">
                          "{student.transcript}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                      to="/students/$id"
                      params={{ id: student.studentId }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700 bg-ink-800/80 light:bg-slate-200/80 border border-hairline hover:bg-[#3FB8AF] hover:text-[#100E0C] hover:border-[#3FB8AF] transition"
                    >
                      Review Dossier <ChevronRight size={13} />
                    </Link>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-hairline bg-ink-900/60 light:bg-slate-50 px-4 py-3 flex items-center justify-between text-[12px] text-secondary-warm">
          <span>
            {assignment?.title} · Trounce Speech Console
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-[4px] bg-ink-800 light:bg-slate-200 hover:text-primary-warm text-secondary-warm transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
