import { API_URL } from "@/lib/config";
import { authClient } from "@/services/authClient";
import type {
  AdminOverview,
  AdminRole,
  AdminSystem,
  AdminUser,
  AdminUserDetail,
  AdminUserQuery,
} from "@/types";

export const adminQueryKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  system: ["admin", "system"] as const,
  users: (query: AdminUserQuery) => ["admin", "users", query] as const,
  usersPrefix: ["admin", "users"] as const,
  user: (id: string) => ["admin", "user", id] as const,
  sessions: (id: string) => ["admin", "user", id, "sessions"] as const,
  developerRequests: ["admin", "developer-requests"] as const,
};

/** fetch JSON của API admin — lỗi ném Error kèm message từ backend. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? json?.message ?? `HTTP ${res.status}`);
  }
  return (json.data ?? json) as T;
}

/** Lỗi trả về từ Better Auth client ({ data, error }) → ném Error. */
function unwrap<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) throw new Error(res.error.message ?? "Request failed");
  return res.data as T;
}

export const fetchAdminOverview = () => request<AdminOverview>("/admin/overview");

export const fetchAdminSystem = () => request<AdminSystem>("/admin/system");

export const fetchAdminUsers = (query: AdminUserQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return request<{ total: number; items: AdminUser[] }>(`/admin/users?${params}`);
};

export const fetchAdminUserDetail = (id: string) =>
  request<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);

/** Xoá qua backend (dọn cả file trên MinIO), không qua Better Auth removeUser. */
export const deleteAdminUser = (id: string) =>
  request<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

// ── Vai trò / khoá / phiên: Better Auth admin plugin ───────────────────
export const setAdminUserRole = async (userId: string, role: AdminRole) =>
  unwrap(await authClient.admin.setRole({ userId, role }));

export const banAdminUser = async (userId: string, banReason?: string) =>
  unwrap(await authClient.admin.banUser({ userId, banReason: banReason || undefined }));

export const unbanAdminUser = async (userId: string) =>
  unwrap(await authClient.admin.unbanUser({ userId }));

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
  unwrap(await authClient.admin.listUserSessions({ userId }))
    .sessions as unknown as AdminSession[];

export const revokeAdminUserSession = async (sessionToken: string) =>
  unwrap(await authClient.admin.revokeUserSession({ sessionToken }));

export const revokeAllAdminUserSessions = async (userId: string) =>
  unwrap(await authClient.admin.revokeUserSessions({ userId }));
