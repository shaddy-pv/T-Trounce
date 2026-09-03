import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  MessageSquare,
  Copy,
  Check,
  Award,
  Send,
} from "lucide-react";
import { Waveform } from "@/components/tarang/Waveform";
import { saveTeacherFeedbackFn } from "@/server/data";
import type { AttemptResult } from "@/types";

export function AudioTranscriptEvaluator({
  attempt,
  index,
  isLate,
}: {
  attempt: AttemptResult;
  index: number;
  isLate?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const initialDuration =
    attempt.durationSec && isFinite(attempt.durationSec) && attempt.durationSec > 0
      ? attempt.durationSec
      : 30;
  const [duration, setDuration] = useState(initialDuration);
  const [copied, setCopied] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Teacher feedback state
  const [feedbackText, setFeedbackText] = useState(attempt.teacherFeedback || "");
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [feedbackSavedToast, setFeedbackSavedToast] = useState(false);

  // Sync state if attempt changes
  useEffect(() => {
    setFeedbackText(attempt.teacherFeedback || "");
  }, [attempt.id, attempt.teacherFeedback]);

  const handleSaveFeedback = async () => {
    if (!feedbackText.trim() || !attempt.id) return;
    setIsSavingFeedback(true);
    try {
      await saveTeacherFeedbackFn({
        data: {
          attemptId: attempt.id,
          feedback: feedbackText.trim(),
        },
      });
      setFeedbackSavedToast(true);
      setTimeout(() => setFeedbackSavedToast(false), 3000);
    } catch (err) {
      console.error("Failed to save teacher feedback:", err);
    } finally {
      setIsSavingFeedback(false);
    }
  };

  // Sync duration with prop if updated
  useEffect(() => {
    if (attempt.durationSec && isFinite(attempt.durationSec) && attempt.durationSec > 0) {
      setDuration(attempt.durationSec);
    }
  }, [attempt.durationSec]);

  // Audio Playback Handler
  const togglePlay = () => {
    if (!audioRef.current || !attempt.audioUrl) return;
    setAudioError(null);

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Force duration resolution if browser reports Infinity on WebM
      if (audioRef.current.duration === Infinity) {
        audioRef.current.currentTime = 1e101;
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            audioRef.current.ontimeupdate = handleTimeUpdate;
            audioRef.current.currentTime = 0;
            audioRef.current
              .play()
              .then(() => setIsPlaying(true))
              .catch((e) => {
                console.warn("Audio playback issue:", e);
                setAudioError("Click to interact & play recording");
                setIsPlaying(false);
              });
          }
        };
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch((e) => {
              console.warn("Audio playback issue:", e);
              setAudioError("Click to interact & play recording");
              setIsPlaying(false);
            });
        }
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      if (isFinite(cur) && !isNaN(cur)) {
        setCurrentTime(cur);
      }
      const d = audioRef.current.duration;
      if (isFinite(d) && !isNaN(d) && d > 0) {
        setDuration(d);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number, fallback: number = 30) => {
    let target = secs;
    if (!isFinite(target) || isNaN(target) || target < 0) {
      target = isFinite(fallback) && fallback > 0 ? fallback : 0;
    }
    const m = Math.floor(target / 60);
    const s = Math.floor(target % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleCopyTranscript = () => {
    if (attempt.transcript) {
      navigator.clipboard.writeText(attempt.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Split transcript to highlight detected fillers
  const transcriptWords = (attempt.transcript || "").split(/(\s+)/);
  const fillerKeywords = new Set([
    "um",
    "uh",
    "matlab",
    "like",
    "actually",
    "er",
    "ah",
    "hmm",
    "basically",
    "literally",
  ]);

  const overallScore =
    attempt.targetDurationSec && attempt.targetDurationSec > 0
      ? Math.min(100, Math.round((attempt.durationSec / attempt.targetDurationSec) * 100))
      : Math.round((attempt.pronunciation + attempt.vocabulary + attempt.grammar) / 3);

  return (
    <div
      className={`rounded-[14px] border p-5 transition-all shadow-sm ${
        isLate
          ? "border-[#E2A33C] ring-1 ring-[#E2A33C]/40 bg-ink-900 shadow-md shadow-[#E2A33C]/10"
          : "border-hairline bg-ink-900 hover:border-[#9C9388]/60"
      }`}
    >
      {/* Native HTML5 audio element */}
      {attempt.audioUrl && (
        <audio
          ref={audioRef}
          src={attempt.audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={() => {
            setAudioError("Audio stream ready for playback.");
            setIsPlaying(false);
          }}
          onLoadedMetadata={() => {
            if (
              audioRef.current &&
              isFinite(audioRef.current.duration) &&
              !isNaN(audioRef.current.duration) &&
              audioRef.current.duration > 0
            ) {
              setDuration(audioRef.current.duration);
            } else if (attempt.durationSec && attempt.durationSec > 0) {
              setDuration(attempt.durationSec);
            }
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-[#3FB8AF]/15 px-2.5 py-0.5 num text-[11px] font-semibold text-[#3FB8AF]">
              Attempt #{index + 1}
            </span>
            {isLate && (
              <span className="inline-flex items-center gap-1 rounded bg-[#E2A33C]/20 px-2.5 py-0.5 num text-[11px] font-semibold text-[#E2A33C]">
                Late Submission
              </span>
            )}
            {attempt.assignmentId && (
              <span
                className="inline-flex items-center gap-1 rounded bg-[#E2A33C]/15 px-2.5 py-0.5 num text-[11px] font-medium text-[#E2A33C]"
                title={attempt.assignmentTitle}
              >
                Homework · {attempt.assignmentTitle || "Batch Submission"}
              </span>
            )}
            <span className="num text-[12px] text-tertiary-warm">
              {attempt.createdAt
                ? new Date(attempt.createdAt).toLocaleString()
                : "Recently recorded"}
            </span>
          </div>
          <h3 className="display mt-1.5 text-[16px] text-primary-warm font-medium leading-snug">
            "{attempt.prompt}"
          </h3>
        </div>

        {/* Aggregate Score Pill */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="num text-[10px] uppercase tracking-wider text-tertiary-warm">
              Overall Fluency
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <Award size={16} className="text-[#3FB8AF]" />
              <p className="display num text-[22px] font-semibold text-[#3FB8AF]">
                {overallScore}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Player Strip */}
      <div className="mt-4 rounded-[10px] border border-hairline bg-ink-950 p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={!attempt.audioUrl}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-all ${
              attempt.audioUrl
                ? "bg-[#3FB8AF] text-[#100E0C] hover:scale-105 active:scale-95 shadow-md shadow-[#3FB8AF]/20"
                : "bg-ink-800 text-tertiary-warm cursor-not-allowed opacity-50"
            }`}
            title={
              !attempt.audioUrl
                ? "Audio stream not recorded"
                : isPlaying
                  ? "Pause audio"
                  : "Play student recording"
            }
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-[11px] num">
              <span className="flex items-center gap-1.5 font-medium text-secondary-warm">
                <Volume2
                  size={13}
                  className={isPlaying ? "text-[#3FB8AF] animate-pulse" : "text-[#3FB8AF]"}
                />
                {isPlaying ? "Playing Student Voice Recording..." : "Student Audio Playback"}
              </span>
              <span className="text-tertiary-warm font-mono">
                {formatTime(currentTime, 0)} / {formatTime(duration, attempt.durationSec || 30)}
              </span>
            </div>

            {/* Scrubber bar */}
            <input
              type="range"
              min={0}
              max={duration && isFinite(duration) ? duration : attempt.durationSec || 30}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              disabled={!attempt.audioUrl}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-ink-800 accent-[#3FB8AF]"
            />
          </div>

          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
            }}
            disabled={!attempt.audioUrl}
            className="text-tertiary-warm hover:text-secondary-warm transition"
            title="Reset audio to beginning"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {audioError && (
          <p className="mt-2 text-[11px] text-alert-amber text-center">{audioError}</p>
        )}

        {/* Waveform Visualization */}
        <div className="mt-3.5 opacity-95">
          <Waveform mode="thumbnail" data={attempt.waveform} height={32} />
        </div>
      </div>

      {/* Spoken Transcript Evaluation */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#3FB8AF]" />
            <span className="num text-[11px] uppercase tracking-wider text-secondary-warm font-semibold">
              Spoken Transcript & Clarity Analysis
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 num text-[11px] text-tertiary-warm">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-alert-amber" />
                {attempt.fillerCount ?? 0} fillers
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-alert-rust" />
                {attempt.pauseCount ?? 0} pauses
              </span>
            </div>

            <button
              onClick={handleCopyTranscript}
              className="inline-flex items-center gap-1 rounded bg-ink-800/80 px-2 py-1 text-[11px] text-secondary-warm hover:text-primary-warm transition"
              title="Copy verbatim transcript to clipboard"
            >
              {copied ? <Check size={12} className="text-[#3FB8AF]" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Verbatim Transcript Box */}
        <div className="mt-2.5 rounded-[10px] border border-hairline bg-ink-950 p-4 text-[14px] leading-relaxed text-primary-warm shadow-inner">
          {attempt.transcript && attempt.transcript.trim().length > 0 ? (
            transcriptWords.map((word, i) => {
              const clean = word.toLowerCase().replace(/[^a-z]/g, "");
              const isFiller = fillerKeywords.has(clean);
              if (isFiller) {
                return (
                  <span
                    key={i}
                    className="inline-block rounded bg-[#E2A33C]/25 px-1.5 py-0.5 font-semibold text-[#E2A33C] mx-0.5"
                    title="Detected hesitation / filler word"
                  >
                    {word}
                  </span>
                );
              }
              return <span key={i}>{word}</span>;
            })
          ) : (
            <span className="italic text-tertiary-warm">
              No transcript captured during this session.
            </span>
          )}
        </div>
      </div>

      {/* Teacher Feedback Card */}
      <div className="mt-5 rounded-[10px] border border-[#3FB8AF]/30 bg-[#3FB8AF]/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[#3FB8AF]" />
            <span className="num text-[11px] uppercase tracking-wider font-semibold text-primary-warm">
              Teacher Feedback
            </span>
          </div>
          {feedbackSavedToast && (
            <span className="num inline-flex items-center gap-1 text-[11px] font-medium text-[#3FB8AF]">
              <Check size={12} /> Feedback saved to student dashboard
            </span>
          )}
        </div>

        <p className="mt-1 text-[12px] text-secondary-warm">
          Write feedback for this recording. The student will see this note directly on their
          homework screen.
        </p>

        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <textarea
            rows={2}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="e.g. Great pace and articulation! Try pausing briefly before introducing your second point."
            className="flex-1 rounded-[8px] border border-hairline bg-ink-950 p-3 text-[13px] text-primary-warm placeholder:text-tertiary-warm focus:border-[#3FB8AF] focus:outline-none resize-none"
          />
          <button
            onClick={handleSaveFeedback}
            disabled={isSavingFeedback || !feedbackText.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[#3FB8AF] px-4 py-2 text-[13px] font-semibold text-[#100E0C] transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 self-end sm:self-auto"
          >
            <Send size={13} />
            {isSavingFeedback ? "Saving..." : "Save Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
