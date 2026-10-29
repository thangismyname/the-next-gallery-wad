import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { sendResetPasswordEmail } from "./mail.js";
import { dbPool } from "../config/db.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Production: không chạy với secret mẫu / quá ngắn (ký session + URL ảnh).
const secret = requireEnv("BETTER_AUTH_SECRET");
if (
  process.env.NODE_ENV === "production" &&
  (secret.length < 32 || secret.startsWith("change-me"))
) {
  throw new Error("BETTER_AUTH_SECRET is a placeholder or shorter than 32 chars — generate one with: openssl rand -base64 32");
}

// Đăng nhập Google / GitHub là tuỳ chọn: chỉ bật khi có đủ client id + secret.
const socialProviders = Object.fromEntries(
  [
    ["google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["github", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ]
    .filter(([, id, sec]) => process.env[id] && process.env[sec])
    .map(([name, id, sec]) => [
      name,
      { clientId: process.env[id], clientSecret: process.env[sec] },
    ]),
);

// Origin được phép gọi auth (CSRF) — TRUSTED_ORIGINS, mặc định = CORS_ORIGINS.
export const trustedOrigins = (process.env.TRUSTED_ORIGINS || process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: dbPool,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({
        to: user.email,
        userName: user.name,
        resetUrl: url,
      });
    },
  },
  socialProviders,
  secret,
  baseURL: requireEnv("BETTER_AUTH_URL"),
  trustedOrigins,
  plugins: [admin()],
});
