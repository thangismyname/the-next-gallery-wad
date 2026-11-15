import type { HttpClient } from "../http";
import type {
  AdminOverview,
  AdminRole,
  AdminSystem,
  AdminUser,
  AdminUserDetail,
  AdminUserQuery,
  AdminUserSort,
  AiCoverage,
} from "../types";

export type { AdminRole, AdminOverview, AdminSystem, AdminUser, AdminUserDetail, AdminUserQuery, AdminUserSort, AiCoverage };

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

export const createAdminService = (http: HttpClient) => ({
  fetchAdminOverview: (): Promise<AdminOverview> =>
    http.get<AdminOverview>("/admin/overview"),

  fetchAdminSystem: (): Promise<AdminSystem> =>
    http.get<AdminSystem>("/admin/system"),

  fetchAdminUsers: (query: AdminUserQuery): Promise<{ total: number; items: AdminUser[] }> => {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params[key] = String(value);
    }
    return http.get<{ total: number; items: AdminUser[] }>("/admin/users", {
      params,
    });
  },

  fetchAdminUserDetail: (id: string): Promise<AdminUserDetail> =>
    http.get<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),

  deleteAdminUser: (id: string): Promise<{ success: boolean }> =>
    http.del<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}`),
});
