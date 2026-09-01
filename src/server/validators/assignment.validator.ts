import { z } from "zod";

export const CreateAssignmentInputSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(150),
  instructions: z.string().default("Practice speaking clearly with optimal rhythm."),
  prompt: z.string().min(5, "Prompt must be at least 5 characters"),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  durationSec: z.number().int().min(10).max(300),
  targetSession: z.enum(["summer", "autumn", "winter", "spring"]),
  targetBatch: z.enum(["morning", "evening"]),
  dueDate: z.string().optional(),
});

export const DeleteAssignmentInputSchema = z.object({
  id: z.string().min(1, "Assignment ID is required"),
});

export const AssignmentFilterSchema = z
  .object({
    session: z.enum(["summer", "autumn", "winter", "spring", "all"]).optional(),
    batch: z.enum(["morning", "evening", "all"]).optional(),
    batchId: z.string().optional(),
  })
  .optional();

export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInputSchema>;
export type DeleteAssignmentInput = z.infer<typeof DeleteAssignmentInputSchema>;
