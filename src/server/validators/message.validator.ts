import { z } from "zod";

export const CreateMessageInputSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  teacherId: z.string().optional(),
  teacherName: z.string().optional(),
  content: z.string().min(1, "Message content cannot be empty").max(2000),
  senderRole: z.enum(["teacher", "student"]).optional(),
});

export const MarkMessageReadInputSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
});

export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>;
export type MarkMessageReadInput = z.infer<typeof MarkMessageReadInputSchema>;
