import type { WaveformSegment } from "./audio.types";

export interface AttemptResult {
  id: string;
  studentId?: string;
  moduleId?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  prompt: string;
  transcript?: string;
  audioId?: string;
  audioUrl?: string;
  audioMimeType?: string;
  audioSize?: number;
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  durationSec: number;
  targetDurationSec?: number; // Target prompt duration — used to compute completion%
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  teacherFeedback?: string;
  waveform: WaveformSegment[];
  createdAt?: string;
}

export interface SaveAttemptPayload {
  studentId: string;
  moduleId: string;
  assignmentId?: string;
  result: AttemptResult;
}
