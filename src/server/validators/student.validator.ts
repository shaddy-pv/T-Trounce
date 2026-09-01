import { z } from "zod";

export const StudentStatusSchema = z.enum(["on-track", "nudge", "flagged"]);

export const UpdateStudentStatusInputSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  status: StudentStatusSchema,
});

export const StudentRosterFilterSchema = z
  .object({
    session: z.string().optional(),
    batch: z.string().optional(),
    batchId: z.string().optional(),
  })
  .optional();

export type UpdateStudentStatusInput = z.infer<typeof UpdateStudentStatusInputSchema>;
