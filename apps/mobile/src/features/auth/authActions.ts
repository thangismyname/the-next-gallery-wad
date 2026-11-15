import { authClient } from "@/lib/authClient";
import { WEB_URL } from "@/lib/config";

import { authErrorKey } from "./authErrors";
import type { ForgotPasswordValues, SignInValues, SignUpValues } from "./authSchemas";

/**
 * Auth calls used by the auth screens. Each returns an i18n error key, or null on
 * success. On success Better Auth updates the session store itself, so the root
 * `Stack.Protected` guard moves to the app — screens don't navigate.
 */
type Result = Promise<string | null>;

async function run(call: () => Promise<{ error: unknown }>, fallback: string): Result {
  try {
    const { error } = await call();
    return error ? authErrorKey(error as { code?: string; status?: number }, fallback) : null;
  } catch {
    return "auth.networkError";
  }
}

export const signInWithEmail = ({ email, password }: SignInValues): Result =>
  run(() => authClient.signIn.email({ email, password }), "auth.loginError");

export const signUpWithEmail = ({ name, email, password }: SignUpValues): Result =>
  run(() => authClient.signUp.email({ name, email, password }), "auth.loginError");

/** The email links to the web reset page (same flow as the web app). */
export const requestPasswordReset = ({ email }: ForgotPasswordValues): Result =>
  run(
    () => authClient.requestPasswordReset({ email, redirectTo: `${WEB_URL}/reset-password` }),
    "auth.forgotPasswordError",
  );

export type SocialProvider = "google" | "github";

/** Opens the provider in an auth browser session; returns to the app via tng://. */
export const signInWithProvider = (provider: SocialProvider): Result =>
  run(() => authClient.signIn.social({ provider, callbackURL: "/" }), "auth.oauthError");
