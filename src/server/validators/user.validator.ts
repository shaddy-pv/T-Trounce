import { z } from "zod";

export const CreateUserInputSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["teacher", "student"]),
  passwordPlain: z.string().min(6, "Password must be at least 6 characters"),
  sessionSeason: z.enum(["summer", "autumn", "winter", "spring"]).optional(),
  batchTime: z.enum(["morning", "evening"]).optional(),
  batchId: z.string().optional(),
});

export const DeleteUserInputSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
export type DeleteUserInput = z.infer<typeof DeleteUserInputSchema>;
