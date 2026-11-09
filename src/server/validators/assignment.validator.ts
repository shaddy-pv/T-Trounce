import { z } from "zod";

export const CreateAssignmentInputSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(150),
  instructions: z.string().max(5000).default("Practice speaking clearly with optimal rhythm."),
  prompt: z.string().min(5, "Prompt must be at least 5 characters").max(5000),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  durationSec: z.number().int().min(10).max(300),
  targetSession: z.enum(["summer", "autumn", "winter", "spring"]),
  targetBatch: z.enum(["morning", "evening"]),
  dueDate: z.string().max(100).optional(),
});

export const DeleteAssignmentInputSchema = z.object({
  id: z.string().min(1, "Assignment ID is required").max(200),
});

export const AssignmentFilterSchema = z
  .object({
    session: z.enum(["summer", "autumn", "winter", "spring", "all"]).optional(),
    batch: z.enum(["morning", "evening", "all"]).optional(),
    batchId: z.string().max(100).optional(),
  })
  .optional();

export const SendReminderInputSchema = z.object({
  assignmentId: z.string().min(1).max(200),
  studentId: z.string().max(200).optional(),
  channel: z.enum(["whatsapp", "in-app", "both"]).optional(),
});

export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInputSchema>;
export type DeleteAssignmentInput = z.infer<typeof DeleteAssignmentInputSchema>;
