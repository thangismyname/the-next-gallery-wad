/** Better Auth error → i18n key (codes from @better-auth/core error codes). */
const BY_CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "auth.invalidCredentials",
  USER_ALREADY_EXISTS: "auth.emailExists",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "auth.emailExists",
  INVALID_EMAIL: "auth.invalidEmail",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
};

export function authErrorKey(
  error: { code?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  // status 0 / missing = request never reached the server.
  if (!error.status) return "auth.networkError";
  return fallback;
}
