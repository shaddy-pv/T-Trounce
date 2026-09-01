import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  CheckCircle2,
  Award,
  BookOpen,
} from "lucide-react";
import { Waveform } from "@/components/tarang/Waveform";
import { fetchAssignmentByIdFn, fetchStudentAttemptsFn, saveAttemptFn } from "@/server/data";
import { useAudioRecorder } from "@/features/practice/hooks/useAudioRecorder";
import { analyzeAudioSignal } from "@/features/practice/lib/audio-analyzer";
import { useUser } from "@/lib/auth";
import type { AssignmentPublic } from "@/server/services/assignment.service";
import type { AttemptResult } from "@/types";

export const Route = createFileRoute("/practice/assignment/$assignmentId")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  loader: async ({
    params,
    context,
  }): Promise<{
    assignment: AssignmentPublic | null;
    existingAttempt: AttemptResult | null;
  }> => {
    const studentId = context.session?.userId;
    const [assignment, attempts] = await Promise.all([
      fetchAssignmentByIdFn({ data: params.assignmentId }),
      studentId ? fetchStudentAttemptsFn({ data: studentId }) : Promise.resolve([]),
    ]);

    const existingAttempt =
      attempts.find((att) => att.assignmentId === params.assignmentId) ?? null;

    return { assignment, existingAttempt };
  },
  head: ({ loaderData }) => {
    const a = (loaderData as { assignment?: AssignmentPublic | null } | undefined)?.assignment;
    return {
      meta: [
        { title: `${a?.title ?? "Homework Assignment"} · Tarang` },
        {
          name: "description",
          content: a?.prompt ?? "Record your assignment answer with Tarang.",
        },
      ],
    };
  },
  component: AssignmentRecordingSession,
});

function AssignmentRecordingSession() {
  const { assignmentId } = Route.useParams();
  const loaderData = Route.useLoaderData() as {
    assignment?: AssignmentPublic | null;
    existingAttempt?: AttemptResult | null;
  };
  const navigate = useNavigate();
  const user = useUser();

  const a: AssignmentPublic =
    loaderData?.assignment ??
    ({
      id: assignmentId,
      title: "Speaking Practice",
      instructions: "Speak clearly on this prompt.",
      prompt: "Speak clearly on this prompt.",
      difficulty: "Beginner",
      durationSec: 45,
    } as AssignmentPublic);

  const existingAttempt = loaderData?.existingAttempt ?? null;

  // If user already has an attempt, start in "review" mode unless they choose to retake
  const [isRetaking, setIsRetaking] = useState(false);

  // Audio Playback state for existing completed attempt
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(existingAttempt?.durationSec || 30);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const { phase, formattedTime, stream, micError, transcript, startRecording, stopRecording } =
    useAudioRecorder();

  // Auth guard
  useEffect(() => {
    if (user === null) navigate({ to: "/login", replace: true });
    else if (user && user.role !== "student") navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const handleStop = async () => {
    const { samples, elapsed, audioUrl, transcript } = await stopRecording();
    const studentId = user?.userId;
    if (!studentId) {
      navigate({ to: "/login", replace: true });
      return;
    }
    const studentName = user?.name || "Student";
    const attemptId = `${assignmentId}-${Date.now()}`;

    // Perform real acoustic signal analysis
    const analysis = analyzeAudioSignal(samples, elapsed, a.difficulty);
    const cleanPrompt = a.prompt.replace(/^[“"']|[”"']$/g, "").trim();

    const fullResult = {
      id: attemptId,
      studentId,
      moduleId: "assignment-module",
      assignmentId,
      assignmentTitle: a.title,
      prompt: a.prompt,
      transcript: transcript ? transcript.trim() : "",
      audioUrl: audioUrl || undefined,
      durationSec: analysis.durationSec,
      pronunciation: analysis.pronunciation,
      vocabulary: analysis.vocabulary,
      grammar: analysis.grammar,
      fillerCount: analysis.fillerCount,
      pauseCount: analysis.pauseCount,
      feedback: analysis.feedback,
      waveform: analysis.waveform,
      createdAt: new Date().toISOString(),
    };

    // Persist attempt to MongoDB
    try {
      await saveAttemptFn({
        data: {
          studentId,
          moduleId: "assignment-module",
          assignmentId,
          result: fullResult,
        },
      });
    } catch (err) {
      console.warn("Attempt save fallback:", err);
    }

    window.setTimeout(() => {
      navigate({
        to: "/result/$attemptId",
        params: { attemptId },
      });
    }, 400);
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => setIsPlayingAudio(false));
    }
  };

  const formatSecs = (secs: number, fallback: number = 30) => {
    let target = secs;
    if (!isFinite(target) || isNaN(target) || target < 0) {
      target = isFinite(fallback) && fallback > 0 ? fallback : 0;
    }
    const m = Math.floor(target / 60);
    const s = Math.floor(target % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // If there is an existing completed submission and student is not currently retaking
  if (existingAttempt && !isRetaking) {
    const overallScore = Math.round(
      (existingAttempt.pronunciation + existingAttempt.vocabulary + existingAttempt.grammar) / 3,
    );
    const words = (existingAttempt.transcript || "").split(/(\s+)/);
    const fillerKeywords = new Set(["um", "uh", "matlab", "like", "actually", "er", "ah"]);

    return (
      <div className="min-h-screen bg-ink-950 text-primary-warm">
        <div className="mx-auto flex min-h-screen w-full max-w-[540px] flex-col border-x border-hairline px-5 py-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-hairline pb-4">
            <Link
              to="/practice"
              className="inline-flex items-center gap-1.5 text-[14px] text-secondary-warm hover:text-primary-warm"
            >
              <ArrowLeft size={16} />
              Back to Practice Hub
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3FB8AF]/15 px-3 py-1 text-[12px] font-semibold text-[#3FB8AF]">
              <CheckCircle2 size={13} />
              Completed & Submitted
            </span>
          </div>

          {/* Hidden audio element */}
          {existingAttempt.audioUrl && (
            <audio
              ref={audioPlayerRef}
              src={existingAttempt.audioUrl}
              onPlay={() => setIsPlayingAudio(true)}
              onPause={() => setIsPlayingAudio(false)}
              onEnded={() => {
                setIsPlayingAudio(false);
                setAudioCurrentTime(0);
              }}
              onTimeUpdate={() => {
                if (audioPlayerRef.current) {
                  setAudioCurrentTime(audioPlayerRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (
                  audioPlayerRef.current &&
                  isFinite(audioPlayerRef.current.duration) &&
                  !isNaN(audioPlayerRef.current.duration) &&
                  audioPlayerRef.current.duration > 0
                ) {
                  setAudioDuration(audioPlayerRef.current.duration);
                } else if (existingAttempt.durationSec && existingAttempt.durationSec > 0) {
                  setAudioDuration(existingAttempt.durationSec);
                }
              }}
            />
          )}

          {/* Title & Assignment Prompt */}
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#3FB8AF]" />
              <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
                Homework Assignment · {a.difficulty}
              </p>
            </div>
            <h1 className="display mt-2 text-[24px] font-medium leading-snug">{a.title}</h1>
            <p className="mt-1 text-[13px] text-secondary-warm">{a.instructions}</p>
          </div>

          {/* Submitted Audio Recording Card */}
          <div className="mt-6 rounded-[12px] border border-hairline bg-ink-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-secondary-warm">
                <Volume2 size={14} className="text-[#3FB8AF]" />
                Your Submitted Recording
              </span>
              <span className="num text-[12px] text-tertiary-warm">
                {existingAttempt.createdAt
                  ? new Date(existingAttempt.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recorded"}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={togglePlayback}
                disabled={!existingAttempt.audioUrl}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-all ${
                  existingAttempt.audioUrl
                    ? "bg-[#3FB8AF] text-[#100E0C] hover:scale-105 active:scale-95 shadow-md shadow-[#3FB8AF]/20"
                    : "bg-ink-800 text-tertiary-warm cursor-not-allowed opacity-50"
                }`}
                title={isPlayingAudio ? "Pause recording" : "Listen to your submitted recording"}
              >
                {isPlayingAudio ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[11px] text-tertiary-warm">
                  <span>{isPlayingAudio ? "Playing..." : "Audio Ready"}</span>
                  <span>
                    {formatSecs(audioCurrentTime, 0)} /{" "}
                    {formatSecs(audioDuration, existingAttempt.durationSec || 30)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={
                    audioDuration && isFinite(audioDuration)
                      ? audioDuration
                      : existingAttempt.durationSec || 30
                  }
                  step={0.1}
                  value={audioCurrentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setAudioCurrentTime(t);
                    if (audioPlayerRef.current) audioPlayerRef.current.currentTime = t;
                  }}
                  disabled={!existingAttempt.audioUrl}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ink-800 accent-[#3FB8AF]"
                />
              </div>

              <button
                onClick={() => {
                  if (audioPlayerRef.current) {
                    audioPlayerRef.current.currentTime = 0;
                    setAudioCurrentTime(0);
                  }
                }}
                className="text-tertiary-warm hover:text-secondary-warm"
                title="Reset audio"
              >
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Waveform */}
            <div className="mt-4 opacity-95">
              <Waveform mode="thumbnail" data={existingAttempt.waveform} height={32} />
            </div>
          </div>

          {/* Transcript Card */}
          <div className="mt-5 rounded-[12px] border border-hairline bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-secondary-warm">
                <Sparkles size={14} className="text-[#3FB8AF]" />
                Verbatim Spoken Transcript
              </span>
              <div className="flex items-center gap-2 num text-[11px] text-tertiary-warm">
                <span>{existingAttempt.fillerCount ?? 0} fillers</span>
                <span>·</span>
                <span>{existingAttempt.pauseCount ?? 0} pauses</span>
              </div>
            </div>

            <div className="mt-3 rounded-[8px] border border-hairline bg-ink-950 p-3.5 text-[13px] leading-relaxed text-primary-warm">
              {words.map((word, i) => {
                const clean = word.toLowerCase().replace(/[^a-z]/g, "");
                const isFiller = fillerKeywords.has(clean);
                if (isFiller) {
                  return (
                    <span
                      key={i}
                      className="rounded bg-[#E2A33C]/25 px-1 py-0.5 font-medium text-[#E2A33C]"
                    >
                      {word}
                    </span>
                  );
                }
                return <span key={i}>{word}</span>;
              })}
            </div>
          </div>

          {/* Diagnostic Scores */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            <div className="rounded-[8px] border border-hairline bg-ink-900 p-3 text-center">
              <p className="num text-[10px] uppercase text-tertiary-warm">Overall</p>
              <p className="num mt-1 text-[18px] font-bold text-[#3FB8AF]">{overallScore}%</p>
            </div>
            <div className="rounded-[8px] border border-hairline bg-ink-900 p-3 text-center">
              <p className="num text-[10px] uppercase text-tertiary-warm">Pronounce</p>
              <p className="num mt-1 text-[18px] font-semibold text-primary-warm">
                {existingAttempt.pronunciation}%
              </p>
            </div>
            <div className="rounded-[8px] border border-hairline bg-ink-900 p-3 text-center">
              <p className="num text-[10px] uppercase text-tertiary-warm">Vocab</p>
              <p className="num mt-1 text-[18px] font-semibold text-primary-warm">
                {existingAttempt.vocabulary}%
              </p>
            </div>
            <div className="rounded-[8px] border border-hairline bg-ink-900 p-3 text-center">
              <p className="num text-[10px] uppercase text-tertiary-warm">Grammar</p>
              <p className="num mt-1 text-[18px] font-semibold text-primary-warm">
                {existingAttempt.grammar}%
              </p>
            </div>
          </div>

          {/* Coach Feedback */}
          {existingAttempt.feedback && (
            <div className="mt-4 rounded-[8px] border border-[#3FB8AF]/30 bg-[#3FB8AF]/5 p-3.5 text-[12px] text-secondary-warm">
              <span className="font-semibold text-primary-warm block mb-1">Teacher Feedback:</span>
              <p>{existingAttempt.feedback}</p>
            </div>
          )}

          {/* Retake / Actions */}
          <div className="mt-8 flex flex-col gap-3 pb-8">
            <button
              onClick={() => {
                if (audioPlayerRef.current) audioPlayerRef.current.pause();
                setIsRetaking(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#3FB8AF] py-3.5 text-[14px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-md shadow-[#3FB8AF]/20"
            >
              <RotateCcw size={16} />
              Retake Practice (Record New Attempt)
            </button>
            <Link
              to="/practice"
              className="flex w-full items-center justify-center rounded-[12px] border border-hairline bg-ink-900 py-3 text-[13px] text-secondary-warm transition hover:border-[#9C9388]"
            >
              Back to Practice Hub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active Recording Studio View
  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col border-x border-hairline">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between px-5">
          {existingAttempt && isRetaking ? (
            <button
              onClick={() => setIsRetaking(false)}
              className="inline-flex items-center gap-1.5 text-[14px] text-secondary-warm hover:text-primary-warm"
            >
              <ArrowLeft size={16} />
              Cancel Retake
            </button>
          ) : (
            <Link
              to="/practice"
              className="inline-flex items-center gap-1.5 text-[14px] text-secondary-warm hover:text-primary-warm"
            >
              <ArrowLeft size={16} />
              Back
            </Link>
          )}

          <span
            className={
              "num text-[14px] tabular-nums " +
              (phase === "recording" ? "text-primary-warm" : "text-tertiary-warm")
            }
          >
            {formattedTime}
          </span>
        </header>

        {/* Prompt */}
        <section className="px-6 pt-10">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Homework Prompt · {a.difficulty}
            </p>
            {isRetaking && (
              <span className="num text-[11px] rounded bg-[#E2A33C]/20 px-2 py-0.5 font-medium text-[#E2A33C]">
                Retake Mode
              </span>
            )}
          </div>
          <h1 className="display mt-3 text-[26px] leading-[1.2] text-primary-warm">“{a.prompt}”</h1>
          <p className="mt-3 text-[13px] text-secondary-warm">
            Aim for ~{a.durationSec} seconds. Speak naturally — pause if you need to think.
          </p>
        </section>

        {/* Live Waveform */}
        <section className="mt-8 px-5">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-5">
            {phase === "recording" ? (
              <Waveform mode="live" stream={stream} height={140} />
            ) : (
              <div className="flex h-[140px] items-center justify-center">
                <p className="text-[13px] text-tertiary-warm">
                  {micError ?? "Tap record when you are ready to speak"}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Real-time Live Speech-to-Text Transcript Display */}
        {phase === "recording" && (
          <section className="mt-4 px-5">
            <div className="rounded-[12px] border border-[#3FB8AF]/40 bg-ink-900/90 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-[#3FB8AF]">
                  <span className="size-2 animate-pulse rounded-full bg-[#3FB8AF]" />
                  Live Speech Transcription:
                </span>
                <span className="num text-[11px] text-tertiary-warm">real-time STT</span>
              </div>
              <p className="mt-2 min-h-[44px] rounded-lg border border-hairline/60 bg-ink-950/80 p-3 text-[14px] leading-relaxed text-primary-warm">
                {transcript ? (
                  <span>“{transcript}”</span>
                ) : (
                  <span className="italic text-tertiary-warm">
                    Listening to your voice... Speak your response clearly.
                  </span>
                )}
              </p>
            </div>
          </section>
        )}

        {/* Mic control */}
        <section className="mt-auto px-5 pb-12 pt-8">
          {phase === "idle" && (
            <button
              onClick={startRecording}
              className="flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#3FB8AF] py-4 text-[15px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-lg shadow-[#3FB8AF]/20"
            >
              <Mic size={18} />
              {isRetaking ? "Start New Recording" : "Start Recording"}
            </button>
          )}

          {phase === "recording" && (
            <button
              onClick={handleStop}
              className="flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#C1503B] py-4 text-[15px] font-semibold text-primary-warm transition hover:brightness-110 shadow-lg shadow-[#C1503B]/20"
            >
              <Square size={18} />
              Finish & Submit Homework
            </button>
          )}

          {phase === "uploading" && (
            <div className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-hairline bg-ink-900 py-4 text-[14px] text-secondary-warm">
              <span className="size-2 animate-ping rounded-full bg-[#3FB8AF]" />
              Analyzing Speech & Uploading...
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
