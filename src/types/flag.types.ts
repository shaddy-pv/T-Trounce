export type FlagType = "student_request" | "low_score" | "severe_drop" | "inactivity";
export type FlagStatus = "pending" | "resolved" | "dismissed";

export interface FlagItem {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  attemptId?: string;
  attemptPrompt?: string;
  attemptDurationSec?: number;
  audioUrl?: string;
  type: FlagType;
  category?: string;
  studentNote?: string;
  teacherFeedback?: string;
  status: FlagStatus;
  scorePct?: number;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface CreateFlagInput {
  attemptId?: string;
  studentId?: string;
  type?: FlagType;
  category?: string;
  studentNote?: string;
}

export interface ResolveFlagInput {
  flagId: string;
  teacherFeedback?: string;
  status?: "resolved" | "dismissed";
}
