import { z } from "zod";

export const LoginInputSchema = z.object({
  email: z.email("Please enter a valid email address").max(254),
  passwordPlain: z.string().min(1, "Password is required").max(200),
  role: z.enum(["student", "teacher"]),
});

export const RequestPasswordResetInputSchema = z.object({
  email: z.email("Please enter a valid email address").max(254),
});

export const ResetPasswordInputSchema = z.object({
  email: z.email("Please enter a valid email address").max(254),
  code: z.string().min(4, "Reset code is required").max(20),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(72, "Password must be at most 72 characters"),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetInputSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;
