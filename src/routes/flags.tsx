import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { TeacherShell } from "@/components/tarang/TeacherShell";
import { Waveform } from "@/components/tarang/Waveform";
import { StatusDot } from "@/components/tarang/StatusDot";
import {
  fetchStudentRosterFn,
  fetchFlagsFn,
  resolveFlagFn,
  updateStudentStatusFn,
  sendDirectMessageFn,
} from "@/server/data";
import type { StudentRow, FlagItem } from "@/types";
import {
  Check,
  BellRing,
  Play,
  Pause,
  MessageSquare,
  Send,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/flags")({
  head: () => ({
    meta: [{ title: "Flags · Trounce" }],
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
    const [studentRoster, activeFlags] = await Promise.all([
      fetchStudentRosterFn(),
      fetchFlagsFn({ data: { status: "pending" } }),
    ]);
    return { studentRoster, activeFlags };
  },
  component: FlagsPage,
});

function FlagsPage() {
  const router = useRouter();
  const { studentRoster, activeFlags } = Route.useLoaderData();
  const [flags, setFlags] = useState<FlagItem[]>(activeFlags);
  const [roster, setRoster] = useState<StudentRow[]>(studentRoster);
  const [actingId, setActingId] = useState<string | null>(null);
  const [replyNotes, setReplyNotes] = useState<Record<string, string>>({});
  const [nudgeSuccess, setNudgeSuccess] = useState<Record<string, boolean>>({});

  // Audio Playback in flag cards
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = (audioUrl?: string, flagId?: string) => {
    if (!audioUrl || !flagId) return;
    if (activeAudioId === flagId) {
      audioRef.current?.pause();
      setActiveAudioId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current
          .play()
          .then(() => setActiveAudioId(flagId))
          .catch(() => setActiveAudioId(null));
      }
    }
  };

  const handleResolveFlag = async (
    flagId: string,
    status: "resolved" | "dismissed" = "resolved",
  ) => {
    setActingId(flagId);
    const feedback = replyNotes[flagId]?.trim() || "";
    try {
      await resolveFlagFn({
        data: {
          flagId,
          teacherFeedback: feedback || undefined,
          status,
        },
      });
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
      router.invalidate();
    } catch (err) {
      console.error("Failed to resolve flag:", err);
    } finally {
      setActingId(null);
    }
  };

  const sendNudge = async (studentId: string, studentName: string) => {
    setActingId(studentId);
    try {
      await sendDirectMessageFn({
        data: {
          studentId,
          content: `Hi ${studentName.split(" ")[0]}, we noticed you haven't recorded speaking practice recently. A quick 5-minute attempt today will keep your streak and fluency going!`,
        },
      });
      setNudgeSuccess((prev) => ({ ...prev, [studentId]: true }));
      setRoster((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, flagReason: "Nudged today · Direct notification sent" }
            : s,
        ),
      );
    } catch (err) {
      console.error("Failed to send nudge:", err);
    } finally {
      setActingId(null);
    }
  };

  const resolveStudentStatus = async (studentId: string) => {
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

  const studentRequests = flags.filter((f) => f.type === "student_request");
  const academicAlertFlags = flags.filter(
    (f) => f.type === "low_score" || f.type === "severe_drop",
  );

  // Also include students in roster with status flagged that may not have explicit FlagDoc
  const flaggedStudents = roster.filter(
    (s) => s.status === "flagged" && !studentRequests.some((f) => f.studentId === s.id),
  );
  const nudgeStudents = roster.filter((s) => s.status === "nudge");

  return (
    <TeacherShell>
      {/* Hidden audio element for student recording previews */}
      <audio
        ref={audioRef}
        onEnded={() => setActiveAudioId(null)}
        onError={() => setActiveAudioId(null)}
      />

      <div className="border-b border-hairline pb-6">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-[#C1503B]">
          faculty intervention console
        </p>
        <h1 className="display mt-2 text-[28px]">Students who need you</h1>
        <p className="mt-1 text-[13px] text-secondary-warm">
          Review student help requests, listen to flagged submissions, and intervene for students
          with low fluency scores.
        </p>
      </div>

      {/* SECTION 1: STUDENT HELP REQUESTS */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <p className="num text-[11px] uppercase tracking-[0.18em] text-[#E2A33C] flex items-center gap-1.5">
            <HelpCircle size={13} />
            Student Help Requests · {studentRequests.length}
          </p>
          <span className="text-[12px] text-tertiary-warm">Action required by teacher</span>
        </div>

        {studentRequests.length === 0 ? (
          <div className="mt-3 rounded-[8px] border border-hairline bg-ink-900/60 p-6 text-center text-[13px] text-tertiary-warm">
            No active student help requests. All student submissions are clear.
          </div>
        ) : (
          <div className="mt-3 grid gap-4">
            {studentRequests.map((flag) => {
              const isPlaying = activeAudioId === flag.id;
              const isActing = actingId === flag.id;

              return (
                <div
                  key={flag.id}
                  className="rounded-[12px] border border-[#E2A33C]/50 bg-ink-900 p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusDot status="flagged" />
                        <Link
                          to="/students/$id"
                          params={{ id: flag.studentId }}
                          className="text-[16px] font-semibold text-primary-warm hover:underline"
                        >
                          {flag.studentName}
                        </Link>
                        <span className="rounded bg-[#E2A33C]/20 px-2 py-0.5 num text-[10px] font-semibold text-[#E2A33C]">
                          {flag.category || "Guidance Requested"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-secondary-warm">
                        Flagged {new Date(flag.createdAt).toLocaleString()} · Prompt: “
                        {flag.attemptPrompt || "Practice Recording"}”
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        to="/students/$id"
                        params={{ id: flag.studentId }}
                        className="rounded-[6px] border border-hairline px-3 py-1 text-[12px] text-secondary-warm hover:text-primary-warm hover:bg-ink-800"
                      >
                        Dossier →
                      </Link>
                    </div>
                  </div>

                  {/* Student Question / Note Box */}
                  {flag.studentNote && (
                    <div className="rounded-[8px] border border-hairline bg-ink-950 p-3 text-[13px] text-primary-warm">
                      <span className="num text-[10px] uppercase tracking-wider text-tertiary-warm block mb-1">
                        Student Note:
                      </span>
                      “{flag.studentNote}”
                    </div>
                  )}

                  {/* Audio Snippet Player */}
                  {flag.audioUrl ? (
                    <div className="flex items-center gap-3 rounded-[8px] border border-hairline bg-ink-950 px-3 py-2">
                      <button
                        onClick={() => toggleAudio(flag.audioUrl, flag.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#3FB8AF] text-[#100E0C] hover:scale-105 transition cursor-pointer"
                        title={isPlaying ? "Pause audio" : "Listen to recording"}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                      </button>
                      <span className="text-[12px] text-secondary-warm flex-1">
                        {isPlaying
                          ? "Playing student recording..."
                          : "Listen to student voice submission"}
                        {flag.attemptDurationSec ? ` (${flag.attemptDurationSec}s)` : ""}
                      </span>
                      {flag.scorePct !== undefined && (
                        <span className="num text-[12px] font-semibold text-[#E2A33C]">
                          Score: {flag.scorePct}%
                        </span>
                      )}
                    </div>
                  ) : null}

                  {/* Reply and Resolve Bar */}
                  <div className="pt-2 border-t border-hairline flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      placeholder="Type guidance or feedback for student (sent to their messages)..."
                      value={replyNotes[flag.id] || ""}
                      onChange={(e) =>
                        setReplyNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))
                      }
                      className="flex-1 min-w-[240px] rounded-[8px] border border-hairline bg-ink-950 px-3 py-1.5 text-[12px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-hidden"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResolveFlag(flag.id, "resolved")}
                        disabled={isActing}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#3FB8AF] px-3.5 py-1.5 text-[12px] font-semibold text-[#100E0C] hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                      >
                        <Check size={13} />
                        {isActing ? "Saving..." : "Send Feedback & Resolve"}
                      </button>
                      <button
                        onClick={() => handleResolveFlag(flag.id, "dismissed")}
                        disabled={isActing}
                        className="rounded-[8px] border border-hairline px-3 py-1.5 text-[12px] text-tertiary-warm hover:text-secondary-warm hover:bg-ink-800 transition cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: ACADEMIC ATTENTION & LOW SCORES */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <p className="num text-[11px] uppercase tracking-[0.18em] text-[#C1503B] flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Academic Alerts · {flaggedStudents.length}
          </p>
          <span className="text-[12px] text-tertiary-warm">
            Critically low fluency (&lt;50%) or inactivity
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-[8px] border border-[#C1503B]/60">
          <table className="w-full text-[13px]">
            <tbody>
              {flaggedStudents.map((s, i) => (
                <tr
                  key={s.id}
                  className={
                    "transition hover:bg-ink-900 " + (i > 0 ? "border-t border-hairline" : "")
                  }
                >
                  <td className="w-6 px-3 py-3">
                    <StatusDot status="flagged" />
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
                  <td className="px-2 py-3 w-[180px]">
                    <Waveform mode="thumbnail" data={s.waveform} height={20} />
                  </td>
                  <td className="num px-2 py-3 text-[#C1503B] font-medium">
                    {s.flagReason ?? `${s.focus} · ${s.scorePct}%`}
                  </td>
                  <td className="num px-2 py-3 text-right text-secondary-warm">{s.lastActive}</td>
                  <td className="px-3 py-3 text-right space-x-3">
                    <button
                      onClick={() => sendNudge(s.id, s.name)}
                      disabled={actingId === s.id}
                      className={
                        "inline-flex items-center gap-1 num text-[12px] cursor-pointer transition " +
                        (nudgeSuccess[s.id]
                          ? "text-[#3FB8AF] font-medium"
                          : "text-[#E2A33C] hover:underline")
                      }
                    >
                      {nudgeSuccess[s.id] ? (
                        <>
                          <Check size={12} />
                          Nudged
                        </>
                      ) : (
                        <>
                          <BellRing size={12} />
                          Nudge
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => resolveStudentStatus(s.id)}
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
              {flaggedStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-tertiary-warm">
                    No students currently flagged for low scores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: INACTIVITY NUDGES */}
      <section className="mt-10 mb-12">
        <div className="flex items-center justify-between">
          <p className="num text-[11px] uppercase tracking-[0.18em] text-[#E2A33C] flex items-center gap-1.5">
            <BellRing size={13} />
            Needs a Nudge · {nudgeStudents.length}
          </p>
          <span className="text-[12px] text-tertiary-warm">Inactive for &gt;2 days</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-[8px] border border-hairline">
          <table className="w-full text-[13px]">
            <tbody>
              {nudgeStudents.map((s, i) => (
                <tr
                  key={s.id}
                  className={
                    "transition hover:bg-ink-900 " + (i > 0 ? "border-t border-hairline" : "")
                  }
                >
                  <td className="w-6 px-3 py-3">
                    <StatusDot status="nudge" />
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
                  <td className="px-2 py-3 w-[180px]">
                    <Waveform mode="thumbnail" data={s.waveform} height={20} />
                  </td>
                  <td className="num px-2 py-3 text-secondary-warm">
                    {s.flagReason ?? `${s.focus} · ${s.scorePct}%`}
                  </td>
                  <td className="num px-2 py-3 text-right text-secondary-warm">{s.lastActive}</td>
                  <td className="px-3 py-3 text-right space-x-3">
                    <button
                      onClick={() => sendNudge(s.id, s.name)}
                      disabled={actingId === s.id}
                      className={
                        "inline-flex items-center gap-1 num text-[12px] cursor-pointer transition " +
                        (nudgeSuccess[s.id]
                          ? "text-[#3FB8AF] font-medium"
                          : "text-[#E2A33C] hover:underline")
                      }
                    >
                      {nudgeSuccess[s.id] ? (
                        <>
                          <Check size={12} />
                          Nudged Today
                        </>
                      ) : (
                        <>
                          <BellRing size={12} />
                          Send Nudge
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => resolveStudentStatus(s.id)}
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
              {nudgeStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[13px] text-tertiary-warm">
                    No students currently pending a nudge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </TeacherShell>
  );
}
