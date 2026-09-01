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
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  waveform: WaveformSegment[];
  createdAt?: string;
}

export interface SaveAttemptPayload {
  studentId: string;
  moduleId: string;
  assignmentId?: string;
  result: AttemptResult;
}
