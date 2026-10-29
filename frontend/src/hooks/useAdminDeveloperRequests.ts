import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminDeveloperRequests,
  reviewDeveloperRequest,
} from "@/services/developer";
import { adminQueryKeys } from "@/services/admin";

/** Mọi yêu cầu Developer Mode (lọc ở client) — dùng chung cho trang duyệt + badge sidebar. */
export function useAdminDeveloperRequests() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminQueryKeys.developerRequests,
    queryFn: () => fetchAdminDeveloperRequests(),
    refetchInterval: 60_000,
  });
  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      reviewDeveloperRequest(id, approve),
    // Badge sidebar + ô "Yêu cầu chờ duyệt" ở Tổng quan cùng cập nhật.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
  });

  const requests = query.data ?? [];
  return {
    requests,
    pending: requests.filter((r) => r.status === "pending"),
    loading: query.isPending,
    error: query.isError,
    review: (id: string, approve: boolean) => review.mutateAsync({ id, approve }),
    reviewingId: review.isPending ? review.variables?.id : undefined,
  };
}
