import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminQueryKeys, unwrapAuth, type AdminUser, type AdminUserQuery } from "@tng/shared";

import { authClient } from "@/lib/authClient";
import { adminApi, developerApi } from "@/services";

/** Same queries + keys as the web admin pages (`frontend/src/features/admin`). */
export const useAdminOverview = () => useQuery({ queryKey: adminQueryKeys.overview, queryFn: adminApi.fetchAdminOverview });

export const useAdminSystem = () =>
  useQuery({ queryKey: adminQueryKeys.system, queryFn: adminApi.fetchAdminSystem, refetchInterval: 30_000 });

export const useAdminUsers = (query: AdminUserQuery) =>
  useQuery({
    queryKey: adminQueryKeys.users(query),
    queryFn: () => adminApi.fetchAdminUsers(query),
    placeholderData: keepPreviousData,
  });

export const useAdminUserDetail = (id: string) =>
  useQuery({ queryKey: adminQueryKeys.user(id), queryFn: () => adminApi.fetchAdminUserDetail(id), enabled: !!id, retry: false });

export interface AdminSession {
  id: string;
  token: string;
  updatedAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const useAdminUserSessions = (id: string) =>
  useQuery({
    queryKey: adminQueryKeys.sessions(id),
    queryFn: async () => unwrapAuth(await authClient.admin.listUserSessions({ userId: id })).sessions as unknown as AdminSession[],
    enabled: !!id,
  });

export type AdminUserAction = "role" | "ban" | "unban" | "logout" | "delete";

/** Role · ban (+ reason) · unban · sign out everywhere · delete (+ all their media) · revoke one session. */
export function useAdminUserActions(user: AdminUser | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
  const action = useMutation({
    mutationFn: async ({ kind, reason }: { kind: AdminUserAction; reason?: string }) => {
      if (!user) return kind;
      const userId = user.id;
      if (kind === "role") unwrapAuth(await authClient.admin.setRole({ userId, role: user.role === "admin" ? "user" : "admin" }));
      else if (kind === "ban") unwrapAuth(await authClient.admin.banUser({ userId, banReason: reason || undefined }));
      else if (kind === "unban") unwrapAuth(await authClient.admin.unbanUser({ userId }));
      else if (kind === "logout") unwrapAuth(await authClient.admin.revokeUserSessions({ userId }));
      else await adminApi.deleteAdminUser(userId);
      return kind;
    },
    onSuccess: invalidate,
  });
  const revokeSession = useMutation({
    mutationFn: async (sessionToken: string) => unwrapAuth(await authClient.admin.revokeUserSession({ sessionToken })),
    onSuccess: invalidate,
  });
  return { action, revokeSession };
}

/** Every Developer Mode request (filtered on the client, like the web page). */
export function useAdminDeveloperRequests() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.developerRequests,
    queryFn: () => developerApi.fetchAdminDeveloperRequests(),
    refetchInterval: 60_000,
  });
  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => developerApi.reviewDeveloperRequest(id, approve),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
  });
  return { query, requests: query.data ?? [], review };
}
