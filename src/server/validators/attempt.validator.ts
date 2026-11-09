import { z } from "zod";
import { ACOUSTIC_THRESHOLDS, UPLOAD_LIMITS } from "@/config/constants";

/** Attempt IDs are client-generated so that a retry of the same save is idempotent. */
const AttemptIdSchema = z
  .string()
  .regex(/^[\w.-]{1,200}$/, "Invalid attempt ID")
  .min(1);

export const WaveformSegmentSchema = z.object({
  v: z.number().min(0).max(1),
  kind: z.enum(["clear", "filler", "pause"]).optional(),
});

export const AttemptResultSchema = z.object({
  id: AttemptIdSchema,
  studentId: z.string().max(200).optional(),
  moduleId: z.string().max(200).optional(),
  assignmentId: z.string().max(200).optional(),
  assignmentTitle: z.string().max(300).optional(),
  prompt: z.string().max(5000),
  transcript: z.string().max(20000).optional(),
  audioId: z.string().max(200).optional(),
  audioUrl: z
    .string()
    .max(UPLOAD_LIMITS.maxAudioDataUriBytes, "This recording is too large.")
    .optional(),
  audioMimeType: z.string().max(100).optional(),
  audioSize: z.number().optional(),
  transcriptionStatus: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  durationSec: z
    .number()
    .nonnegative()
    .max(ACOUSTIC_THRESHOLDS.maxDurationSec * 2),
  targetDurationSec: z.number().nonnegative().max(3600).optional(),
  pronunciation: z.number().min(0).max(100),
  vocabulary: z.number().min(0).max(100),
  grammar: z.number().min(0).max(100),
  fillerCount: z.number().int().nonnegative().max(100000),
  pauseCount: z.number().int().nonnegative().max(100000),
  feedback: z.string().max(2000),
  waveform: z.array(WaveformSegmentSchema).max(1024),
  createdAt: z.string().max(50).optional(),
});

export const SaveAttemptInputSchema = z.object({
  studentId: z.string().max(200).optional(),
  moduleId: z.string().max(200),
  assignmentId: z.string().max(200).optional(),
  assignmentTitle: z.string().max(300).optional(),
  result: AttemptResultSchema,
});

export type SaveAttemptInput = z.infer<typeof SaveAttemptInputSchema>;

export const UpdateAttemptTranscriptInputSchema = z.object({
  attemptId: z.string().min(1).max(200),
  transcript: z.string().min(1).max(20000),
});

export type UpdateAttemptTranscriptInput = z.infer<typeof UpdateAttemptTranscriptInputSchema>;

export const StreamTranscribeInputSchema = z.object({
  audioBase64: z.string().max(UPLOAD_LIMITS.maxTranscribeBase64Bytes, "This clip is too large."),
  mimeType: z.string().max(100).default("audio/wav"),
  promptContext: z.string().max(2000).optional(),
  sequence: z.number().int().default(0),
  isFinal: z.boolean().default(false),
});
