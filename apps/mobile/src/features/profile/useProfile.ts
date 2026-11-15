import { useQuery } from "@tanstack/react-query";
import { profileStatsQueryKey, storageQueryKey } from "@tng/shared";

import { authClient } from "@/lib/authClient";
import { profileApi } from "@/services";

export const sessionsQueryKey = ["settings", "sessions"] as const;

/** Photos · videos · favorites · friends · moments · storage (web `ProfileSummaryCard`). */
export function useProfileStats() {
  return useQuery({ queryKey: profileStatsQueryKey, queryFn: profileApi.fetchProfileStats, staleTime: 60_000 });
}

/** Bytes of photos / videos / trash + trash count (web `StorageCard`). */
export function useStorage() {
  return useQuery({ queryKey: storageQueryKey, queryFn: profileApi.fetchStorageBreakdown, staleTime: 30_000 });
}

/** Linked sign-in methods (credential | google | github) — "Change password" only for credential. */
export function useAccountProviders(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", "accounts", userId],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message);
      return (data ?? []).map((a) => a.providerId);
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

/** Signed-in devices (Better Auth `listSessions`). */
export function useSessions() {
  return useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
