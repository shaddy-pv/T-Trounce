import { z } from "zod";

export const CreateFlagInputSchema = z.object({
  attemptId: z.string().max(200).optional(),
  studentId: z.string().max(200).optional(),
  type: z
    .enum(["student_request", "low_score", "severe_drop", "inactivity"])
    .default("student_request"),
  category: z.string().max(100).default("General Feedback"),
  studentNote: z.string().max(1000).optional(),
});

export const ResolveFlagInputSchema = z.object({
  flagId: z.string().min(1).max(200),
  teacherFeedback: z.string().max(2000).optional(),
  status: z.enum(["resolved", "dismissed"]).default("resolved"),
});

export const FlagFilterSchema = z
  .object({
    status: z.enum(["all", "pending", "resolved", "dismissed"]).default("pending"),
    type: z
      .enum(["all", "student_request", "low_score", "severe_drop", "inactivity"])
      .default("all"),
    studentId: z.string().max(200).optional(),
  })
  .optional();
