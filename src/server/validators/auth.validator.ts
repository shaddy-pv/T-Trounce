import { z } from "zod";

export const LoginInputSchema = z.object({
  email: z.email("Please enter a valid email address").max(254),
  passwordPlain: z.string().min(1, "Password is required").max(200),
  role: z.enum(["student", "teacher"]),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
