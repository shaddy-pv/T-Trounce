import { z } from "zod";

export const WaveformSegmentSchema = z.object({
  v: z.number().min(0).max(1),
  kind: z.enum(["clear", "filler", "pause"]).optional(),
});

export const AttemptResultSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().optional(),
  moduleId: z.string().optional(),
  assignmentId: z.string().optional(),
  assignmentTitle: z.string().optional(),
  prompt: z.string(),
  transcript: z.string().optional(),
  audioId: z.string().optional(),
  audioUrl: z.string().optional(),
  audioMimeType: z.string().optional(),
  audioSize: z.number().optional(),
  transcriptionStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  durationSec: z.number().nonnegative(),
  pronunciation: z.number().min(0).max(100),
  vocabulary: z.number().min(0).max(100),
  grammar: z.number().min(0).max(100),
  fillerCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  feedback: z.string(),
  waveform: z.array(WaveformSegmentSchema),
  createdAt: z.string().optional(),
});

export const SaveAttemptInputSchema = z.object({
  studentId: z.string().optional(),
  moduleId: z.string(),
  assignmentId: z.string().optional(),
  assignmentTitle: z.string().optional(),
  result: AttemptResultSchema,
});

export type SaveAttemptInput = z.infer<typeof SaveAttemptInputSchema>;
