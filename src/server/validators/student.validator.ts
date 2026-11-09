import { z } from "zod";

export const StudentStatusSchema = z.enum(["on-track", "nudge", "flagged"]);

export const UpdateStudentStatusInputSchema = z.object({
  studentId: z.string().min(1, "Student ID is required").max(200),
  status: StudentStatusSchema,
});

// Fixed values keep the roster cache from growing with arbitrary filter strings.
export const StudentRosterFilterSchema = z
  .object({
    session: z.enum(["summer", "autumn", "winter", "spring", "all"]).optional(),
    batch: z.enum(["morning", "evening", "all"]).optional(),
    batchId: z
      .string()
      .regex(/^[a-z]+(-[a-z]+)?$/, "Invalid batch")
      .max(50)
      .optional(),
  })
  .optional();

export type UpdateStudentStatusInput = z.infer<typeof UpdateStudentStatusInputSchema>;
