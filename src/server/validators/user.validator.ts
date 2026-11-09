import { z } from "zod";

export const CreateUserInputSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.email("Please enter a valid email address").max(254),
  phone: z
    .string()
    .max(20)
    .regex(/^[+\d\s()-]*$/, "Please enter a valid phone number")
    .optional(),
  role: z.enum(["teacher", "student"]),
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  passwordPlain: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(72, "Password must be at most 72 characters"),
  sessionSeason: z.enum(["summer", "autumn", "winter", "spring"]).optional(),
  batchTime: z.enum(["morning", "evening"]).optional(),
  batchId: z.string().max(100).optional(),
});

export const DeleteUserInputSchema = z.object({
  userId: z.string().min(1, "User ID is required").max(200),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
export type DeleteUserInput = z.infer<typeof DeleteUserInputSchema>;
