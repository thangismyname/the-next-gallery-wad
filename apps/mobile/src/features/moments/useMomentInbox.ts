// Lời mời ghép ảnh + thông báo đã lưu (chuông dưới avatar ở tab Moments). Mobile chưa có WebSocket →
// hỏi lại server mỗi 30 s khi đang mở.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { momentInvitationsQueryKey, notificationsQueryKey, type AppNotification } from "@tng/shared";

import { momentsApi, notificationsApi } from "@/services";

const POLL_MS = 30_000;

export function useMomentInbox() {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: momentInvitationsQueryKey,
    queryFn: () => momentsApi.fetchMomentInvitations({ limit: 30 }),
    refetchInterval: POLL_MS,
  });
  const notifications = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: notificationsApi.listNotifications,
    refetchInterval: POLL_MS,
  });

  const setNotifications = (update: (items: AppNotification[]) => AppNotification[]) =>
    queryClient.setQueryData<AppNotification[]>(notificationsQueryKey, (items) => update(items ?? []));
  const refreshNotifications = () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey });

  const removeNotification = useMutation({
    mutationFn: notificationsApi.deleteNotification,
    onMutate: (id: string) => setNotifications((items) => items.filter((n) => n.id !== id)),
    onError: refreshNotifications,
  });
  const clearNotifications = useMutation({
    mutationFn: notificationsApi.clearNotifications,
    onMutate: () => setNotifications(() => []),
    onError: refreshNotifications,
  });
  const refreshMoments = () => queryClient.invalidateQueries({ queryKey: ["moments"] });
  // Người tạo hoặc người tham gia xoá cả moment chung / bản nháp.
  const deleteMoment = useMutation({ mutationFn: momentsApi.deleteMoment, onSettled: refreshMoments });
  // Người được mời từ chối (người tạo nhận thông báo).
  const decline = useMutation({ mutationFn: momentsApi.declineMoment, onSettled: refreshMoments });

  const invites = invitations.data?.items ?? [];
  const notes = notifications.data ?? [];
  return {
    invitations: invites,
    notifications: notes,
    isPending: invitations.isPending || notifications.isPending,
    /** Badge = lời mời còn ô của mình + thông báo. */
    count: invites.filter((m) => (m.myPendingSlots?.length ?? 0) > 0).length + notes.length,
    removeNotification: (id: string) => removeNotification.mutate(id),
    clearNotifications: () => clearNotifications.mutate(),
    deleteMoment: (id: string) => deleteMoment.mutateAsync(id),
    decline: (id: string) => decline.mutateAsync(id),
    refetch: () => Promise.all([invitations.refetch(), notifications.refetch()]),
  };
}
