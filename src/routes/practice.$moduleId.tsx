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
} from "lucide-react";
import { Waveform } from "@/components/tarang/Waveform";
import { fetchModuleByIdFn, fetchStudentAttemptsFn, saveAttemptFn } from "@/server/data";
import { useAudioRecorder } from "@/features/practice/hooks/useAudioRecorder";
import { analyzeAudioSignal, FILLER_KEYWORDS } from "@/features/practice/lib/audio-analyzer";
import { useUser } from "@/lib/auth";
import type { AttemptResult, Module } from "@/types";

export const Route = createFileRoute("/practice/$moduleId")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  loader: async ({
    params,
    context,
  }): Promise<{
    mod: Module | null;
    existingAttempt: AttemptResult | null;
  }> => {
    const studentId = context.session?.userId;
    const [mod, attempts] = await Promise.all([
      fetchModuleByIdFn({ data: params.moduleId }),
      studentId ? fetchStudentAttemptsFn({ data: studentId }) : Promise.resolve([]),
    ]);
    const match = attempts.find((att) => att.moduleId === params.moduleId) ?? null;
    return { mod: (mod as Module | null) ?? null, existingAttempt: match };
  },
  head: ({ loaderData }) => {
    const m = (loaderData as { mod?: Module | null } | undefined)?.mod;
    return {
      meta: [
        { title: `${m?.title ?? "Practice Drill"} · Trounce` },
        { name: "description", content: m?.prompt ?? "Speech practice module." },
      ],
    };
  },
  component: PracticeModuleSession,
});

function PracticeModuleSession() {
  const { moduleId } = Route.useParams();
  const loaderData = Route.useLoaderData() as {
    mod?: Module | null;
    existingAttempt: AttemptResult | null;
  };
  const navigate = useNavigate();
  const user = useUser();

  const mod: Module =
    loaderData?.mod ||
    ({
      id: moduleId,
      title: "Audio Signal Practice",
      prompt: "Speak clearly with steady rhythm and optimal volume.",
      difficulty: "Beginner",
      durationSec: 45,
    } as Module);

  const existingAttempt = loaderData?.existingAttempt ?? null;

  // If user already has an attempt, start in "review" mode unless they choose to retake
  const [isRetaking, setIsRetaking] = useState(false);

  // Audio Playback state for existing completed attempt
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(existingAttempt?.durationSec || 30);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const {
    phase,
    formattedTime,
    stream,
    micError,
    finalTranscript,
    interimTranscript,
    transcript,
    volumeLevel,
    liveFillerCount,
    livePauseCount,
    sttAvailable,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    startRecording,
    stopRecording,
    setPhase,
  } = useAudioRecorder();

  // Auth guard
  useEffect(() => {
    if (user === null) navigate({ to: "/login", replace: true });
    else if (user && user.role !== "student" && !user.isAdmin && user.role !== "admin")
      navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const handleStop = async () => {
    const { samples, elapsed, audioUrl, transcript } = await stopRecording();
    const studentId = user?.userId;
    if (!studentId) {
      navigate({ to: "/login", replace: true });
      return;
    }
    const studentName = user?.name || "Student";
    const attemptId = `${moduleId}-${Date.now()}`;

    // Perform real acoustic signal analysis
    const analysis = analyzeAudioSignal(samples, elapsed, mod.difficulty, transcript);

    const fullResult = {
      id: attemptId,
      studentId,
      moduleId,
      prompt: mod.prompt,
      transcript: transcript ? transcript.trim() : "",
      audioUrl: audioUrl || undefined,
      durationSec: analysis.durationSec,
      targetDurationSec: mod.durationSec, // target duration of the prompt — for completion%
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
          moduleId,
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
        replace: true, // swaps recording page in history — back goes to /practice, not a stale retake
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

  // Completed Review Mode
  if (existingAttempt && !isRetaking) {
    const words = (existingAttempt.transcript || "").split(/(\s+)/);

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
              Completed & Evaluated
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

          {/* Prompt Header */}
          <div className="mt-6">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Drill · {mod.difficulty}
            </p>
            <h1 className="display mt-2 text-[24px] font-medium leading-snug">“{mod.prompt}”</h1>
          </div>

          {/* Submitted Audio Recording */}
          <div className="mt-6 rounded-[12px] border border-hairline bg-ink-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-secondary-warm">
                <Volume2 size={14} className="text-[#3FB8AF]" />
                Your Recorded Audio Response
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
                title={isPlayingAudio ? "Pause recording" : "Play recording"}
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

            {/* Waveform Color Legend */}
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-secondary-warm">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#3FB8AF]" />
                  clear
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#E2A33C]" />
                  filler ({existingAttempt.fillerCount ?? 0})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#6B645A]" />
                  pause ({existingAttempt.pauseCount ?? 0})
                </span>
              </div>
            </div>
          </div>

          {/* Transcript Box */}
          <div className="mt-5 rounded-[12px] border border-hairline bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-secondary-warm">
                <Sparkles size={14} className="text-[#3FB8AF]" />
                Verbatim Spoken Transcript
              </span>
              <div className="flex items-center gap-2 num text-[11px] text-tertiary-warm">
                <span className="text-[#E2A33C]">{existingAttempt.fillerCount ?? 0} fillers</span>
                <span>·</span>
                <span>{existingAttempt.pauseCount ?? 0} pauses</span>
              </div>
            </div>

            <div className="mt-3 rounded-[8px] border border-hairline bg-ink-950 p-3.5 text-[13px] leading-relaxed text-primary-warm">
              {words.length > 0 && words[0].length > 0 ? (
                words.map((word, i) => {
                  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
                  const isFiller = FILLER_KEYWORDS.has(clean);
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
                })
              ) : (
                <span className="italic text-tertiary-warm">
                  Spoken recording captured and stored in MongoDB.
                </span>
              )}
            </div>
          </div>

          {/* Teacher Feedback Card */}
          <div className="mt-4 rounded-[8px] border border-hairline bg-ink-900 p-3.5 text-[12px] text-secondary-warm">
            <span className="font-semibold text-primary-warm block mb-1">Teacher Feedback:</span>
            {existingAttempt.teacherFeedback ? (
              <p className="text-primary-warm">{existingAttempt.teacherFeedback}</p>
            ) : (
              <p className="text-tertiary-warm italic">
                Teacher will review your recording and provide feedback on this drill soon.
              </p>
            )}
          </div>

          {/* Retake / Actions */}
          <div className="mt-8 flex flex-col gap-3 pb-8">
            <button
              onClick={() => {
                if (audioPlayerRef.current) audioPlayerRef.current.pause();
                setPhase("idle");
                setIsRetaking(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#3FB8AF] py-3.5 text-[14px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-md shadow-[#3FB8AF]/20 cursor-pointer"
            >
              <RotateCcw size={16} />
              Retake Drill (Record New Attempt)
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

  // Active Recording View
  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col border-x border-hairline">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between px-5">
          {existingAttempt && isRetaking ? (
            <button
              onClick={() => setIsRetaking(false)}
              className="inline-flex items-center gap-1.5 text-[14px] text-secondary-warm hover:text-primary-warm cursor-pointer"
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
        <section className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Prompt · {mod.difficulty}
            </p>
            {isRetaking && (
              <span className="num text-[11px] rounded bg-[#E2A33C]/20 px-2 py-0.5 font-medium text-[#E2A33C]">
                Retake Mode
              </span>
            )}
          </div>
          <h1 className="display mt-3 text-[28px] leading-[1.15] text-primary-warm">
            “{mod.prompt}”
          </h1>
          <p className="mt-3 text-[13px] text-secondary-warm">
            Aim for ~{mod.durationSec} seconds. Speak naturally. Pause if you need to think.
          </p>
        </section>

        {/* Microphone Device Picker (External Mic Support) */}
        {phase === "idle" && (
          <section className="mt-4 px-5">
            <div className="rounded-[10px] border border-hairline bg-ink-900 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-tertiary-warm num">
                  <Mic size={13} className="text-[#3FB8AF]" />
                  Select Audio Input (Mic)
                </span>
                {audioDevices.length > 1 && (
                  <span className="num text-[10px] text-[#3FB8AF]">
                    {audioDevices.length} mics detected
                  </span>
                )}
              </div>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="mt-2 w-full rounded-[6px] border border-hairline bg-ink-950 px-2.5 py-1.5 text-[12px] text-primary-warm focus:border-[#3FB8AF] focus:outline-none"
              >
                {audioDevices.length === 0 ? (
                  <option value="">Default System Microphone</option>
                ) : (
                  audioDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </section>
        )}

        {/* Live Waveform & Input Meter */}
        <section className="mt-6 px-5">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-5">
            {phase === "recording" ? (
              <div className="space-y-3">
                <Waveform mode="live" stream={stream} height={140} />
                {/* Live Volume Meter Bar */}
                <div className="flex items-center gap-2 pt-1 border-t border-hairline/60">
                  <span className="num text-[10px] uppercase text-tertiary-warm">Signal</span>
                  <div className="flex-1 h-1.5 rounded-full bg-ink-950 overflow-hidden">
                    <div
                      className="h-full bg-[#3FB8AF] transition-all duration-75"
                      style={{ width: `${Math.min(100, Math.max(4, volumeLevel * 100))}%` }}
                    />
                  </div>
                  <span className="num text-[10px] text-[#3FB8AF]">
                    {Math.round(volumeLevel * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-[140px] flex-col items-center justify-center text-center">
                <p className="text-[13px] text-tertiary-warm">
                  {micError ?? "Tap record below when you are ready to speak"}
                </p>
                {micError && (
                  <p className="mt-2 text-[11px] text-[#E2A33C]">
                    Please allow microphone access in your browser settings.
                  </p>
                )}
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
              <p className="mt-2 min-h-[48px] rounded-lg border border-hairline/60 bg-ink-950/80 p-3 text-[14px] leading-relaxed text-primary-warm">
                {sttAvailable === false ? (
                  <span className="italic text-[#E2A33C]/80 text-[13px]">
                    Live transcription is not supported in this browser. Use Chrome or Edge for
                    real-time voice-to-text.
                  </span>
                ) : finalTranscript || interimTranscript ? (
                  <span>
                    {finalTranscript && <span>{finalTranscript}</span>}
                    {interimTranscript && (
                      <span className="ml-1 italic text-[#3FB8AF]/90">{interimTranscript}</span>
                    )}
                  </span>
                ) : (
                  <span className="italic text-tertiary-warm">
                    Listening to your voice... Speak your response clearly into your microphone.
                  </span>
                )}
              </p>

              {/* Real-time live filler and pause counts */}
              <div className="mt-2.5 flex items-center justify-between border-t border-hairline/40 pt-2 text-[11px] text-secondary-warm">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#E2A33C]" />
                    <span className="num font-semibold text-[#E2A33C]">{liveFillerCount}</span>{" "}
                    fillers detected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[#6B645A]" />
                    <span className="num font-semibold text-secondary-warm">
                      {livePauseCount}
                    </span>{" "}
                    pauses
                  </span>
                </div>
                <span className="num text-[10px] text-tertiary-warm">Live Voice Diagnostic</span>
              </div>
            </div>
          </section>
        )}

        {/* Mic control */}
        <section className="mt-auto px-5 pb-12 pt-6">
          {phase === "idle" && (
            <button
              onClick={() => startRecording()}
              className="flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#3FB8AF] py-4 text-[15px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-lg shadow-[#3FB8AF]/20 cursor-pointer"
            >
              <Mic size={18} />
              {isRetaking ? "Start New Recording" : "Start Recording"}
            </button>
          )}

          {phase === "recording" && (
            <button
              onClick={handleStop}
              className="flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#C1503B] py-4 text-[15px] font-semibold text-primary-warm transition hover:brightness-110 shadow-lg shadow-[#C1503B]/20 cursor-pointer"
            >
              <Square size={18} />
              Finish & Analyze
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
