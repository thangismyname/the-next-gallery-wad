import type { HttpClient } from "../http";

export type DeveloperStatus = "none" | "pending" | "approved" | "rejected";

export interface DeveloperStatusResult {
  status: DeveloperStatus;
  message: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminDeveloperRequest {
  id: string;
  userId: string;
  status: DeveloperStatus;
  message: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

export const createDeveloperService = (http: HttpClient) => ({
  fetchDeveloperStatus: (): Promise<DeveloperStatusResult> =>
    http.get<DeveloperStatusResult>("/developer/status"),

  requestDeveloper: (message?: string): Promise<DeveloperStatusResult> =>
    http.post<DeveloperStatusResult>("/developer/request", {
      message: message ?? null,
    }),

  fetchAdminDeveloperRequests: (
    status?: DeveloperStatus,
  ): Promise<AdminDeveloperRequest[]> => {
    const params = status ? { status } : undefined;
    return http.get<AdminDeveloperRequest[]>("/admin/developer-requests", {
      params,
    });
  },

  reviewDeveloperRequest: (id: string, approve: boolean): Promise<void> =>
    http.post<void>(`/admin/developer-requests/${encodeURIComponent(id)}/review`, {
      approve,
    }),
});
