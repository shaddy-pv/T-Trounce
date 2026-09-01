import type { WaveformSegment } from "./audio.types";

export type StudentStatus = "on-track" | "nudge" | "flagged";

export type StudentFocusArea = "—" | "Vocab" | "Pron" | "Grammar" | "Fluency" | string;

export interface StudentRow {
  id: string;
  name: string;
  status: StudentStatus;
  focus: StudentFocusArea;
  lastActive: string;
  scorePct: number;
  trendPct: number;
  waveform: WaveformSegment[];
  inactiveDays?: number;
  flagReason?: string;
  sessionSeason?: string;
  batchTime?: string;
  batchId?: string;
}

export interface BatchInfo {
  id: string;
  season?: string;
  time?: string;
  name: string;
  institution: string;
  studentCount: number;
}
