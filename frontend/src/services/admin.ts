import { createAdminService, unwrapAuth } from "@tng/shared";
import { webHttp } from "@/lib/http.web";
import { authClient } from "@/services/authClient";

export const {
  fetchAdminOverview,
  fetchAdminSystem,
  fetchAdminUsers,
  fetchAdminUserDetail,
  deleteAdminUser,
} = createAdminService(webHttp);

// ── Vai trò / khoá / phiên: Better Auth admin plugin ───────────────────

export const setAdminUserRole = async (userId: string, role: "user" | "admin") =>
  unwrapAuth(await authClient.admin.setRole({ userId, role }));

export const banAdminUser = async (userId: string, banReason?: string) =>
  unwrapAuth(await authClient.admin.banUser({ userId, banReason: banReason || undefined }));

export const unbanAdminUser = async (userId: string) =>
  unwrapAuth(await authClient.admin.unbanUser({ userId }));

export interface AdminSession {
  id: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const fetchAdminUserSessions = async (userId: string) =>
  unwrapAuth(await authClient.admin.listUserSessions({ userId }))
    .sessions as unknown as AdminSession[];

export const revokeAdminUserSession = async (sessionToken: string) =>
  unwrapAuth(await authClient.admin.revokeUserSession({ sessionToken }));

export const revokeAllAdminUserSessions = async (userId: string) =>
  unwrapAuth(await authClient.admin.revokeUserSessions({ userId }));
