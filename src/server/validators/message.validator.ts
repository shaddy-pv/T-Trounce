import { z } from "zod";

export const CreateMessageInputSchema = z.object({
  studentId: z.string().min(1, "Student ID is required").max(200),
  teacherId: z.string().max(200).optional(),
  teacherName: z.string().max(200).optional(),
  content: z.string().min(1, "Message content cannot be empty").max(2000),
  senderRole: z.enum(["teacher", "student"]).optional(),
});

export const MarkMessageReadInputSchema = z.object({
  messageId: z.string().min(1, "Message ID is required").max(200),
});

export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>;
export type MarkMessageReadInput = z.infer<typeof MarkMessageReadInputSchema>;
