import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  Flag,
  X,
  Send,
  HelpCircle,
  Loader2,
  Pencil,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Waveform } from "@/components/tarang/Waveform";
import { fetchAttemptByIdFn, createFlagFn, updateAttemptTranscriptFn } from "@/server/data";
import { useUser } from "@/lib/auth";
import { FILLER_KEYWORDS } from "@/features/practice/lib/audio-analyzer";
import type { AttemptResult } from "@/types";

export const Route = createFileRoute("/result/$attemptId")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  loader: async ({ params }): Promise<{ result: AttemptResult }> => {
    const result = await fetchAttemptByIdFn({ data: params.attemptId });
    return { result };
  },
  head: ({ loaderData }) => {
    const res = (loaderData as { result?: AttemptResult } | undefined)?.result;
    return {
      meta: [
        { title: `Diagnostic Result · Trounce` },
        { name: "description", content: res?.feedback ?? "Your speaking attempt, broken down." },
      ],
    };
  },
  component: ResultPage,
});

function ResultPage() {
  const loaderData = Route.useLoaderData() as { result?: AttemptResult } | undefined;
  const user = useUser();
  const navigate = useNavigate();

  const initialResult: AttemptResult =
    loaderData?.result ??
    ({
      id: "attempt",
      prompt: "Speech Practice",
      durationSec: 45,
      pronunciation: 75,
      vocabulary: 70,
      grammar: 80,
      fillerCount: 1,
      pauseCount: 1,
      feedback: "Good speech articulation.",
      waveform: [],
    } as AttemptResult);

  const [result, setResult] = useState<AttemptResult>(initialResult);

  // Sync state if loaderData updates
  useEffect(() => {
    if (loaderData?.result) {
      setResult(loaderData.result);
      if (loaderData.result.durationSec) {
        setAudioDuration(loaderData.result.durationSec);
      }
    }
  }, [loaderData?.result]);

  // Real-time poller: if background Whisper is still transcribing full audio, poll until completed
  useEffect(() => {
    if (result.transcriptionStatus === "completed") return;

    let cancelled = false;
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > 15 || cancelled) {
        clearInterval(interval);
        return;
      }
      try {
        const fresh = await fetchAttemptByIdFn({ data: result.id });
        if (fresh && !cancelled) {
          if (fresh.transcriptionStatus === "completed") {
            setResult(fresh);
            clearInterval(interval);
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [result.id, result.transcriptionStatus]);

  // Audio Playback state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(result.durationSec || 30);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Flag for Teacher Review state
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagCategory, setFlagCategory] = useState("Pronunciation & Accent");
  const [flagNote, setFlagNote] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [isFlaggedSuccess, setIsFlaggedSuccess] = useState(Boolean(result.isFlagged));

  // Edit Transcript state
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState(result.transcript || "");
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [transcriptSavedNotice, setTranscriptSavedNotice] = useState(false);

  // Keep edited transcript in sync when result.transcript completes or updates
  useEffect(() => {
    if (!isEditingTranscript && result.transcript) {
      setEditedTranscript(result.transcript);
    }
  }, [result.transcript, isEditingTranscript]);

  const handleSaveTranscript = async () => {
    const trimmed = editedTranscript.trim();
    if (!trimmed || isSavingTranscript) return;
    setIsSavingTranscript(true);
    try {
      const updated = await updateAttemptTranscriptFn({
        data: {
          attemptId: result.id,
          transcript: trimmed,
        },
      });
      setResult(updated);
      setIsEditingTranscript(false);
      setTranscriptSavedNotice(true);
      setTimeout(() => setTranscriptSavedNotice(false), 4000);
    } catch (err) {
      console.error("Failed to update transcript:", err);
    } finally {
      setIsSavingTranscript(false);
    }
  };

  const handleFlagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (flagSubmitting) return;
    setFlagSubmitting(true);
    try {
      await createFlagFn({
        data: {
          attemptId: result.id,
          category: flagCategory,
          studentNote: flagNote,
          type: "student_request",
        },
      });
      setIsFlaggedSuccess(true);
      setFlagModalOpen(false);
    } catch (err) {
      console.error("Failed to flag attempt for teacher review:", err);
    } finally {
      setFlagSubmitting(false);
    }
  };

  useEffect(() => {
    if (user === null) navigate({ to: "/login", replace: true });
  }, [user, navigate]);

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

  const transcriptWords = (result.transcript || "").split(/(\s+)/);
  const fillerKeywords = FILLER_KEYWORDS;

  // Determine retake target route
  const retakeTo = result.assignmentId
    ? "/practice/assignment/$assignmentId"
    : result.moduleId
      ? "/practice/$moduleId"
      : "/practice";
  const retakeParams = result.assignmentId
    ? { assignmentId: result.assignmentId }
    : result.moduleId
      ? { moduleId: result.moduleId }
      : {};

  return (
    <div className="min-h-screen bg-ink-950 text-primary-warm">
      <div className="mx-auto flex min-h-screen w-full max-w-[500px] flex-col border-x border-hairline pb-12">
        {/* Hidden HTML5 Audio Element */}
        {result.audioUrl && (
          <audio
            ref={audioPlayerRef}
            src={result.audioUrl}
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
              } else if (result.durationSec && result.durationSec > 0) {
                setAudioDuration(result.durationSec);
              }
            }}
          />
        )}

        {/* Top Header */}
        <header className="flex h-14 items-center justify-between px-5">
          <Link
            to="/practice"
            className="inline-flex items-center gap-1.5 text-[14px] text-secondary-warm hover:text-primary-warm"
          >
            <ArrowLeft size={16} />
            Done
          </Link>
          <span className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
            attempt · {result.durationSec || 30}s · saved to mongodb
          </span>
        </header>

        {/* Prompt section */}
        <section className="px-6 pt-5">
          <div className="flex items-center gap-2 text-[#3FB8AF]">
            <CheckCircle2 size={16} />
            <p className="num text-[11px] uppercase tracking-[0.18em]">Signal Analyzed</p>
          </div>
          <p className="mt-1.5 text-[17px] font-medium text-primary-warm leading-snug">
            “{result.prompt}”
          </p>
        </section>

        {/* Audio Player Card */}
        <section className="mt-5 px-5">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-secondary-warm">
                <Volume2 size={14} className="text-[#3FB8AF]" />
                Listen to Your Recording
              </span>
              <span className="font-mono text-[11px] text-tertiary-warm">
                {formatSecs(audioCurrentTime, 0)} /{" "}
                {formatSecs(audioDuration, result.durationSec || 30)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={togglePlayback}
                disabled={!result.audioUrl}
                className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-all ${
                  result.audioUrl
                    ? "bg-[#3FB8AF] text-[#100E0C] hover:scale-105 active:scale-95 shadow-md shadow-[#3FB8AF]/20"
                    : "bg-ink-800 text-tertiary-warm cursor-not-allowed opacity-50"
                }`}
                title={isPlayingAudio ? "Pause recording" : "Play recording"}
              >
                {isPlayingAudio ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>

              <input
                type="range"
                min={0}
                max={audioDuration || 1}
                step={0.1}
                value={audioCurrentTime}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setAudioCurrentTime(t);
                  if (audioPlayerRef.current) audioPlayerRef.current.currentTime = t;
                }}
                disabled={!result.audioUrl}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-ink-800 accent-[#3FB8AF]"
              />
            </div>

            {/* Waveform */}
            <div className="mt-4 opacity-95">
              <Waveform mode="result" data={result.waveform} height={80} />
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-secondary-warm">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#3FB8AF]" />
                  clear
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#E2A33C]" />
                  filler ({result.fillerCount})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#6B645A]" />
                  pause ({result.pauseCount})
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Spoken Transcript Box */}
        <section className="mt-5 px-5">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary-warm">
                <Sparkles size={14} className="text-[#3FB8AF]" />
                <p className="num text-[11px] uppercase tracking-[0.14em]">Spoken Transcript</p>
              </div>
              <div className="flex items-center gap-2">
                {transcriptSavedNotice && (
                  <span className="text-[11px] font-medium text-[#3FB8AF]">
                    ✓ Updated & re-scored
                  </span>
                )}
                {(!result.transcript || result.transcriptionStatus === "processing") &&
                  !isEditingTranscript && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#3FB8AF]">
                      <Loader2 size={12} className="animate-spin" />
                      Transcribing with Whisper...
                    </span>
                  )}
                {!isEditingTranscript && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedTranscript(result.transcript || "");
                      setIsEditingTranscript(true);
                      setTranscriptSavedNotice(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline bg-ink-950 px-2 py-0.5 text-[11px] text-secondary-warm hover:border-[#3FB8AF] hover:text-[#3FB8AF] transition"
                    title="Correct any misrecognized words or names"
                  >
                    <Pencil size={11} />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {isEditingTranscript ? (
              <div className="mt-2.5 space-y-2.5">
                <textarea
                  value={editedTranscript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                  rows={3}
                  className="w-full rounded-[8px] border border-[#3FB8AF]/50 bg-ink-950 p-3 text-[13px] leading-relaxed text-primary-warm placeholder:text-tertiary-warm focus:outline-none focus:border-[#3FB8AF]"
                  placeholder="Type or correct your spoken words here..."
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-[11px] text-tertiary-warm">
                    Correct any misheard words or names (e.g. Shadan). Your fluency metrics & filler count recalculate automatically.
                  </span>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsEditingTranscript(false)}
                      disabled={isSavingTranscript}
                      className="rounded-[8px] border border-hairline px-2.5 py-1 text-[12px] text-secondary-warm hover:border-[#9C9388] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTranscript}
                      disabled={isSavingTranscript || !editedTranscript.trim()}
                      className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#3FB8AF] px-3 py-1 text-[12px] font-medium text-ink-950 hover:bg-[#3FB8AF]/90 disabled:opacity-50 transition"
                    >
                      {isSavingTranscript ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check size={12} />
                          Save Transcript
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 rounded-[8px] border border-hairline bg-ink-950 p-3 text-[13px] leading-relaxed text-primary-warm min-h-[48px]">
                {result.transcript && result.transcript.trim().length > 0 ? (
                  transcriptWords.map((word, i) => {
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
                  })
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-secondary-warm italic py-1">
                    <Loader2 size={13} className="animate-spin text-[#3FB8AF]" />
                    <span>Processing phonetic transcription from audio recording...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Teacher Feedback Card */}
        <section className="mt-5 px-5">
          <div className="rounded-[12px] border border-hairline bg-ink-900 p-4">
            <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
              Teacher Feedback
            </p>
            {result.teacherFeedback ? (
              <p className="mt-2 text-[14px] leading-[1.55] text-primary-warm">
                {result.teacherFeedback}
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-[1.55] text-tertiary-warm italic">
                Teacher will review your recording and provide feedback on this submission soon.
              </p>
            )}
          </div>
        </section>

        {/* Student Flag / Ask Teacher Section */}
        <section className="mt-4 px-5">
          {isFlaggedSuccess ? (
            <div className="rounded-[12px] border border-[#E2A33C]/40 bg-[#E2A33C]/10 p-4">
              <div className="flex items-center gap-2 text-[#E2A33C]">
                <Flag size={15} />
                <p className="num text-[11px] uppercase tracking-wider font-semibold">
                  Flagged for Teacher Review
                </p>
              </div>
              <p className="mt-1.5 text-[13px] text-primary-warm leading-relaxed">
                Your question/flag has been sent to your teacher's console. They will review your
                spoken audio and reply with feedback.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setFlagModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-hairline bg-ink-900 py-3 text-[13px] text-secondary-warm transition hover:border-[#E2A33C] hover:text-primary-warm cursor-pointer"
            >
              <Flag size={14} className="text-[#E2A33C]" />
              Flag for Teacher Review / Ask for Help
            </button>
          )}
        </section>

        {/* Action Buttons */}
        <section className="mt-8 flex flex-col gap-3 px-5">
          {/* replace:true prevents the retake→record→result loop from stacking history entries.
              Back button will always return to /practice (where the student started), not a
              previous result page. */}
          <Link
            to={retakeTo as "/practice"}
            params={retakeParams as Record<string, string>}
            replace
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#3FB8AF]/40 bg-[#3FB8AF]/10 py-3.5 text-[14px] font-semibold text-[#3FB8AF] transition hover:bg-[#3FB8AF]/20"
          >
            <RotateCcw size={16} />
            Retake Practice (Record Again)
          </Link>

          <Link
            to="/practice"
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#3FB8AF] py-3.5 text-[14px] font-semibold text-[#100E0C] transition hover:brightness-110 shadow-md shadow-[#3FB8AF]/20"
          >
            Practice Next Prompt
            <ArrowRight size={16} />
          </Link>

          <Link
            to="/progress"
            className="flex w-full items-center justify-center rounded-[12px] border border-hairline bg-ink-900 py-3 text-[13px] text-secondary-warm transition hover:border-[#9C9388]"
          >
            View Portfolio History
          </Link>
        </section>

        {/* Flag Modal Dialog */}
        {flagModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-[420px] rounded-[14px] border border-hairline bg-ink-900 p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <div className="flex items-center gap-2 text-[#E2A33C]">
                  <Flag size={16} />
                  <h3 className="display text-[16px] text-primary-warm">Flag for Teacher Review</h3>
                </div>
                <button
                  onClick={() => setFlagModalOpen(false)}
                  className="rounded p-1 text-tertiary-warm hover:text-primary-warm cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleFlagSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                    What would you like guidance on?
                  </label>
                  <select
                    value={flagCategory}
                    onChange={(e) => setFlagCategory(e.target.value)}
                    className="mt-1.5 w-full rounded-[8px] border border-hairline bg-ink-950 px-3 py-2 text-[13px] text-primary-warm focus:border-[#3FB8AF] focus:outline-hidden cursor-pointer"
                  >
                    <option value="Pronunciation & Accent">Pronunciation & Accent</option>
                    <option value="Fluency & Pausing">Fluency & Long Pauses</option>
                    <option value="Grammar & Sentence Flow">Grammar & Sentence Flow</option>
                    <option value="Whisper Transcript Discrepancy">Whisper Transcript Issue</option>
                    <option value="General Teacher Guidance">General Teacher Guidance</option>
                  </select>
                </div>

                <div>
                  <label className="num text-[11px] uppercase tracking-wider text-tertiary-warm">
                    Optional Note to Teacher
                  </label>
                  <textarea
                    value={flagNote}
                    onChange={(e) => setFlagNote(e.target.value)}
                    placeholder="e.g., I wasn't sure if my intonation sounded natural in the second half..."
                    rows={3}
                    className="mt-1.5 w-full rounded-[8px] border border-hairline bg-ink-950 p-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-hidden resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setFlagModalOpen(false)}
                    className="rounded-[8px] border border-hairline px-4 py-2 text-[13px] text-secondary-warm hover:bg-ink-850 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={flagSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#E2A33C] px-4 py-2 text-[13px] font-semibold text-[#100E0C] hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                  >
                    <Send size={13} />
                    {flagSubmitting ? "Sending..." : "Submit Flag"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
