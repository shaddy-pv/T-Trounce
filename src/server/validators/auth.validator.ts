import { z } from "zod";

export const LoginInputSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  passwordPlain: z.string().min(1, "Password is required"),
  role: z.enum(["student", "teacher"]),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
