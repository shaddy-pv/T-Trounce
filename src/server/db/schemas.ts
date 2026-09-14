import type { ObjectId } from "mongodb";
import type { WaveformSegment } from "@/types";

export type SessionSeason = "summer" | "autumn" | "winter" | "spring";
export type BatchTime = "morning" | "evening";

export interface UserDoc {
  _id?: ObjectId;
  id: string; // Public ID / Student ID
  email: string; // Unique email identifier
  username?: string; // Optional legacy username
  passwordHash: string; // Bcrypt hashed password
  name: string; // Display name
  role: "admin" | "teacher" | "student";
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string; // e.g. "summer-morning"
  createdAt: Date;
}

export interface ModuleDoc {
  _id?: ObjectId;
  id: string;
  title: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number;
  completed: boolean;
  order: number;
  createdAt: Date;
}

export interface StudentDoc {
  _id?: ObjectId;
  id: string;
  name: string;
  status: "on-track" | "nudge" | "flagged";
  focus: string;
  lastActive: string;
  scorePct: number;
  trendPct: number;
  waveform: WaveformSegment[];
  inactiveDays?: number;
  flagReason?: string;
  sessionSeason?: SessionSeason;
  batchTime?: BatchTime;
  batchId?: string;
  updatedAt: Date;
}

export interface AttemptDoc {
  _id?: ObjectId;
  id: string;
  studentId: string;
  moduleId: string;
  assignmentId?: string;
  assignmentTitle?: string;
  prompt: string;
  transcript?: string; // Full verbatim transcript of spoken audio
  audioId?: string; // Persistent storage audio identifier
  audioUrl?: string; // Permanent streamable audio URL (/api/audio/:audioId)
  audioMimeType?: string; // e.g. "audio/webm", "audio/mp4", "audio/wav"
  audioSize?: number; // File size in bytes
  transcriptionStatus?: "pending" | "processing" | "completed" | "failed";
  durationSec: number;
  targetDurationSec?: number; // Target prompt duration (used for completion%)
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  teacherFeedback?: string;
  isFlagged?: boolean;
  flagReason?: string;
  flagStatus?: "pending" | "resolved" | "dismissed";
  waveform: WaveformSegment[];
  createdAt: Date;
}

export interface BatchDoc {
  _id?: ObjectId;
  id: string; // e.g. "summer-morning"
  season: SessionSeason;
  time: BatchTime;
  name: string; // e.g. "Summer · Morning Batch"
  institution: string;
  teacherId?: string;
  teacherName: string;
  studentCount: number;
  createdAt: Date;
}

export interface AssignmentDoc {
  _id?: ObjectId;
  id: string; // e.g. "hw-1788223..."
  title: string;
  instructions: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number;
  targetSession: SessionSeason; // "summer" | "autumn" | "winter" | "spring"
  targetBatch: BatchTime; // "morning" | "evening"
  batchId: string; // e.g. "summer-morning"
  teacherId: string;
  teacherName: string;
  dueDate?: string;
  createdAt: Date;
}

export interface DirectMessageDoc {
  _id?: ObjectId;
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  content: string;
  read: boolean;
  senderRole?: "teacher" | "student";
  createdAt: Date;
}

export interface FlagDoc {
  _id?: ObjectId;
  id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  attemptId?: string;
  attemptPrompt?: string;
  attemptDurationSec?: number;
  audioUrl?: string;
  type: "student_request" | "low_score" | "severe_drop" | "inactivity";
  category?: string;
  studentNote?: string;
  teacherFeedback?: string;
  status: "pending" | "resolved" | "dismissed";
  scorePct?: number;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}
