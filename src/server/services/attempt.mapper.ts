import type { AttemptResult } from "@/types";
import type { AttemptDoc } from "../db/schemas";

/** Single place that converts a stored attempt into its API shape. */
export function toAttemptResult(doc: AttemptDoc): AttemptResult {
  return {
    id: doc.id,
    studentId: doc.studentId,
    moduleId: doc.moduleId,
    assignmentId: doc.assignmentId,
    assignmentTitle: doc.assignmentTitle,
    prompt: doc.prompt,
    transcript: doc.transcript || "",
    audioId: doc.audioId,
    audioUrl: doc.audioUrl,
    audioMimeType: doc.audioMimeType,
    audioSize: doc.audioSize,
    transcriptionStatus: doc.transcriptionStatus || "completed",
    durationSec: doc.durationSec,
    targetDurationSec: doc.targetDurationSec,
    pronunciation: doc.pronunciation,
    vocabulary: doc.vocabulary,
    grammar: doc.grammar,
    fillerCount: doc.fillerCount,
    pauseCount: doc.pauseCount,
    feedback: doc.feedback,
    teacherFeedback: doc.teacherFeedback,
    isFlagged: doc.isFlagged,
    flagReason: doc.flagReason,
    flagStatus: doc.flagStatus,
    waveform: doc.waveform,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
  };
}
