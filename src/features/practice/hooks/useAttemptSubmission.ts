import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { analyzeAudioSignal } from "@/features/practice/lib/audio-analyzer";
import { invalidateClientDataCache } from "@/lib/client-cache";
import { saveAttemptFn } from "@/server/data";
import type { SaveAttemptInput } from "@/server/validators/attempt.validator";
import type { useAudioRecorder } from "./useAudioRecorder";

const SAVE_ATTEMPTS = 3;
/** Long enough for a large recording on a slow mobile connection. */
const SAVE_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_DELAY_MS = 1500;

type SavePayload = SaveAttemptInput;

async function saveWithRetry(payload: SavePayload): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    try {
      await saveAttemptFn({ data: payload, signal: AbortSignal.timeout(SAVE_TIMEOUT_MS) });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < SAVE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Finishes a recording and saves it. The result screen only opens once the attempt is really stored.
 * If saving fails the recording stays in memory, so the student can retry instead of losing it. The
 * attempt ID stays the same across retries, so a retry can't create a duplicate.
 */
export function useAttemptSubmission(params: {
  recorder: ReturnType<typeof useAudioRecorder>;
  studentId: string | undefined;
  moduleId: string;
  assignmentId?: string;
  assignmentTitle?: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  targetDurationSec: number;
  /** Prefix for the attempt ID, usually the module or assignment ID. */
  idPrefix: string;
}) {
  const navigate = useNavigate();
  const { recorder } = params;
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveErrorDetail, setSaveErrorDetail] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pendingRef = useRef<SavePayload | null>(null);

  // Warn before leaving while a recording exists only in this tab.
  useEffect(() => {
    if (!saveFailed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveFailed]);

  const persist = useCallback(
    async (payload: SavePayload) => {
      setIsSaving(true);
      setSaveFailed(false);
      setSaveErrorDetail(null);
      try {
        await saveWithRetry(payload);
        pendingRef.current = null;
        // These lists now include the new attempt.
        invalidateClientDataCache("student-attempts-");
        invalidateClientDataCache("student-profile-");
        invalidateClientDataCache("student-report-");
        navigate({
          to: "/result/$attemptId",
          params: { attemptId: payload.result.id },
          replace: true,
        });
      } catch (err) {
        console.warn("[useAttemptSubmission] Save failed:", err);
        setSaveFailed(true);
        // Connection failures surface as browser text like "Failed to fetch", which means nothing
        // to a student. Only messages written by our server are shown.
        const isNetworkError =
          err instanceof TypeError ||
          (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"));
        setSaveErrorDetail(!isNetworkError && err instanceof Error ? err.message : null);
        recorder.setPhase("idle");
      } finally {
        setIsSaving(false);
      }
    },
    [navigate, recorder],
  );

  const finishRecording = useCallback(async () => {
    if (recorder.phase !== "recording" || isSaving) return;

    if (!params.studentId) {
      navigate({ to: "/login", replace: true });
      return;
    }

    let recording: Awaited<ReturnType<typeof recorder.stopRecording>>;
    try {
      recording = await recorder.stopRecording();
    } catch (err) {
      // Don't leave the student on the "uploading" screen with no way forward.
      console.error("[useAttemptSubmission] Could not finish recording:", err);
      recorder.setPhase("idle");
      return;
    }

    const analysis = analyzeAudioSignal(
      recording.samples.length > 0 ? recording.samples : recorder.samples,
      recording.elapsed > 0 ? recording.elapsed : recorder.elapsed,
      params.difficulty,
      recording.transcript,
    );

    const payload: SavePayload = {
      studentId: params.studentId,
      moduleId: params.moduleId,
      assignmentId: params.assignmentId,
      result: {
        id: `${params.idPrefix}-${Date.now()}`,
        studentId: params.studentId,
        moduleId: params.moduleId,
        assignmentId: params.assignmentId,
        assignmentTitle: params.assignmentTitle,
        prompt: params.prompt,
        transcript: recording.transcript ? recording.transcript.trim() : "",
        audioUrl: recording.audioUrl || undefined,
        durationSec: analysis.durationSec,
        targetDurationSec: params.targetDurationSec,
        pronunciation: analysis.pronunciation,
        vocabulary: analysis.vocabulary,
        grammar: analysis.grammar,
        fillerCount: analysis.fillerCount,
        pauseCount: analysis.pauseCount,
        feedback: analysis.feedback,
        waveform: analysis.waveform,
      },
    };

    pendingRef.current = payload;
    await persist(payload);
  }, [recorder, isSaving, params, navigate, persist]);

  const retrySave = useCallback(() => {
    if (pendingRef.current && !isSaving) void persist(pendingRef.current);
  }, [persist, isSaving]);

  const discardRecording = useCallback(() => {
    pendingRef.current = null;
    setSaveFailed(false);
    setSaveErrorDetail(null);
  }, []);

  // Stop at the maximum length, so an abandoned recording can't grow without limit.
  const { maxDurationReached } = recorder;
  const finishRef = useRef(finishRecording);
  finishRef.current = finishRecording;
  useEffect(() => {
    if (maxDurationReached) void finishRef.current();
  }, [maxDurationReached]);

  return { finishRecording, saveFailed, saveErrorDetail, isSaving, retrySave, discardRecording };
}
