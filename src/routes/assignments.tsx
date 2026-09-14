import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { TButton } from "@/components/tarang/Button";
import { fetchAssignmentsFn, createAssignmentFn, deleteAssignmentFn } from "@/server/data";
import type { AssignmentPublic } from "@/server/services/assignment.service";
import { useUser } from "@/lib/auth";
import {
  BookOpen,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Check,
  AlertCircle,
  Layers,
  Sparkles,
  Send,
} from "lucide-react";

export const Route = createFileRoute("/assignments")({
  head: () => ({
    meta: [
      { title: "Homework & Assignments · Trounce" },
      {
        name: "description",
        content:
          "Assign speaking drills and homework specifically to student sessions and batches.",
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
    const assignments = await fetchAssignmentsFn();
    return { assignments };
  },
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { assignments: initialAssignments } = Route.useLoaderData();
  const currentUser = useUser();
  const router = useRouter();

  const [assignments, setAssignments] = useState(initialAssignments);
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State for New Homework Creation
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<"Beginner" | "Intermediate" | "Advanced">(
    "Beginner",
  );
  const [durationSec, setDurationSec] = useState(60);
  const [targetSession, setTargetSession] = useState<"summer" | "autumn" | "winter" | "spring">(
    "summer",
  );
  const [targetBatch, setTargetBatch] = useState<"morning" | "evening">("morning");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredAssignments = assignments.filter((a) => {
    const matchesSession = selectedSession === "all" || a.targetSession === selectedSession;
    const matchesBatch = selectedBatch === "all" || a.targetBatch === selectedBatch;
    return matchesSession && matchesBatch;
  });

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !prompt) {
      setFormError("Assignment Title and Speaking Prompt are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    // Safely parse dueDate to ISO string only if valid, otherwise undefined
    const parsedDueDate =
      dueDate && dueDate.trim().length > 0 && !isNaN(new Date(dueDate).getTime())
        ? new Date(dueDate).toISOString()
        : undefined;

    try {
      const created = (await createAssignmentFn({
        data: {
          title: title.trim(),
          instructions: instructions.trim() || "Practice speaking clearly with optimal rhythm.",
          prompt: prompt.trim(),
          difficulty,
          durationSec,
          targetSession,
          targetBatch,
          teacherId: currentUser?.userId || "teacher-1",
          teacherName: currentUser?.name || "Faculty",
          dueDate: parsedDueDate,
        },
      })) as AssignmentPublic;

      setAssignments([created, ...assignments]);
      setSuccessMessage(
        `Successfully broadcasted homework "${created.title}" to ${created.targetSession.toUpperCase()} · ${created.targetBatch.toUpperCase()}!`,
      );
      setShowCreateModal(false);
      // Reset form
      setTitle("");
      setInstructions("");
      setPrompt("");
      setDueDate("");
      await router.invalidate();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create homework assignment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAssignment = async (id: string, assignmentTitle: string) => {
    if (!confirm(`Are you sure you want to delete assignment "${assignmentTitle}"?`)) {
      return;
    }

    try {
      await deleteAssignmentFn({ data: { id } });
      setAssignments(assignments.filter((a) => a.id !== id));
      setSuccessMessage(`Deleted assignment: ${assignmentTitle}`);
      await router.invalidate();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete assignment");
    }
  };

  return (
    <TeacherShell>
      <div className="space-y-6">
        {/* Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Curriculum & Assignment Broadcast
            </p>
            <h1 className="display mt-1 text-[26px]">Targeted Homework & Drills</h1>
            <p className="mt-1 text-[13px] text-secondary-warm">
              Give targeted speech homework specifically to students in your session and batch.
            </p>
          </div>
          <TButton
            size="md"
            onClick={() => {
              setShowCreateModal(true);
              setFormError(null);
              setSuccessMessage(null);
            }}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            Assign New Homework
          </TButton>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="flex items-center justify-between rounded-[8px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/10 px-4 py-3 text-[13px] text-[#3FB8AF]">
            <span className="flex items-center gap-2">
              <Check size={16} />
              {successMessage}
            </span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-[12px] underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Session & Batch Filter */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-hairline bg-ink-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 num text-[11px] uppercase tracking-wider text-tertiary-warm mr-2">
              <Layers size={13} className="text-[#3FB8AF]" />
              Target Session:
            </span>
            {[
              { id: "all", label: "All Sessions" },
              { id: "summer", label: "Summer" },
              { id: "autumn", label: "Autumn" },
              { id: "winter", label: "Winter" },
              { id: "spring", label: "Spring" },
            ].map((ses) => (
              <button
                key={ses.id}
                onClick={() => setSelectedSession(ses.id)}
                className={
                  "rounded-[6px] px-3 py-1 text-[12px] transition " +
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
              { id: "all", label: "All" },
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

        {/* Assignment Cards Grid */}
        {filteredAssignments.length === 0 ? (
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-12 text-center">
            <BookOpen size={32} className="mx-auto text-tertiary-warm opacity-40" />
            <h3 className="display mt-3 text-[16px] text-primary-warm">No homework assigned yet</h3>
            <p className="mt-1 text-[13px] text-secondary-warm">
              Select a session and batch and click "Assign New Homework" to assign speaking tasks to
              students.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredAssignments.map((a) => (
              <div
                key={a.id}
                className="flex flex-col justify-between rounded-[12px] border border-hairline bg-ink-900 p-5 transition hover:border-[#9C9388]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-hairline bg-ink-950 px-2.5 py-1 text-[11px] font-medium text-[#3FB8AF]">
                      <span className="size-1.5 rounded-full bg-[#3FB8AF]" />
                      {a.targetSession.toUpperCase()} · {a.targetBatch.toUpperCase()}
                    </span>
                    <span className="num text-[11px] text-tertiary-warm">
                      {a.difficulty} · {a.durationSec}s
                    </span>
                  </div>

                  <h3 className="display mt-3 text-[17px] text-primary-warm">{a.title}</h3>
                  <p className="mt-1 text-[12px] text-tertiary-warm">{a.instructions}</p>

                  <div className="mt-3 rounded-[8px] border border-hairline bg-ink-950/80 p-3">
                    <p className="num text-[10px] uppercase tracking-wider text-tertiary-warm">
                      Speaking Prompt
                    </p>
                    <p className="mt-1 text-[13px] text-secondary-warm italic line-clamp-3">
                      "{a.prompt}"
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-[12px] text-tertiary-warm">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} />
                    Due:{" "}
                    {a.dueDate && !isNaN(new Date(a.dueDate).getTime())
                      ? new Date(a.dueDate).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Not set"}
                  </span>
                  <button
                    onClick={() => handleDeleteAssignment(a.id, a.title)}
                    className="flex items-center gap-1 text-alert-rust hover:underline"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Assignment Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[520px] rounded-[16px] border border-hairline bg-ink-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div>
                  <h2 className="display text-[18px]">Assign Homework</h2>
                  <p className="text-[12px] text-secondary-warm">
                    Broadcast speech prompts to your batch
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-tertiary-warm hover:text-primary-warm text-[14px]"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-alert-rust bg-alert-rust/10 p-3 text-[12px] text-alert-rust">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateAssignment} className="mt-4 space-y-4">
                {/* Target Session & Batch Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Target Session
                    </label>
                    <select
                      value={targetSession}
                      onChange={(e) =>
                        setTargetSession(
                          e.target.value as "summer" | "autumn" | "winter" | "spring",
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value="summer">Summer (Apr–Jun)</option>
                      <option value="autumn">Autumn (Jul–Sep)</option>
                      <option value="winter">Winter (Oct–Dec)</option>
                      <option value="spring">Spring (Jan–Mar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Target Batch
                    </label>
                    <select
                      value={targetBatch}
                      onChange={(e) => setTargetBatch(e.target.value as "morning" | "evening")}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value="morning">Morning Batch</option>
                      <option value="evening">Evening Batch</option>
                    </select>
                  </div>
                </div>

                {/* Assignment Title */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Assignment Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Weekend Self-Intro Drill"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>

                {/* Coaching Instructions */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Teacher Instructions
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Speak without pauses; focus on clarity and consonant endings."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>

                {/* Speaking Prompt */}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Speaking Prompt (Text for Student to Record)
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Type the speech script or prompt question for students..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="mt-1.5 w-full rounded-[8px] border border-hairline bg-ink-900 p-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none"
                  />
                </div>

                {/* Difficulty, Duration, and Due Date */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Difficulty
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) =>
                        setDifficulty(e.target.value as "Beginner" | "Intermediate" | "Advanced")
                      }
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-2 text-[12px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Duration
                    </label>
                    <select
                      value={durationSec}
                      onChange={(e) => setDurationSec(Number(e.target.value))}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-2 text-[12px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    >
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                      <option value={90}>90s</option>
                      <option value={120}>120s</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-tertiary-warm">
                      Due Date
                    </label>
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-hairline bg-ink-900 px-2 text-[12px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="h-10 rounded-[8px] px-4 text-[13px] text-secondary-warm hover:text-primary-warm"
                  >
                    Cancel
                  </button>
                  <TButton type="submit" size="md" disabled={isSubmitting}>
                    {isSubmitting ? "Broadcasting..." : "Broadcast Homework"}
                  </TButton>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
