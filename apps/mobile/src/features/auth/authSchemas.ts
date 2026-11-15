import { z } from "zod";

// Messages are i18n keys — translated where the error is rendered (FormField).
// Same rules as the web forms + Better Auth defaults (password ≥ 8).
const email = z.string().trim().min(1, "auth.invalidEmail").email("auth.invalidEmail");
const password = z.string().min(8, "auth.passwordTooShort");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "auth.passwordTooShort"),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "auth.nameRequired").max(100),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "auth.passwordMismatch",
  });

export const forgotPasswordSchema = z.object({ email });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
