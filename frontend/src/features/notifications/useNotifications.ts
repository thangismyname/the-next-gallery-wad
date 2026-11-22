// Thông báo đã lưu (backend `/api/notifications`): danh sách + xoá 1 / xoá hết (cập nhật lạc quan).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsQueryKey, type AppNotification } from "@tng/shared";
import { notificationsApi } from "@/services/notifications";

export function useNotifications() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: notificationsQueryKey, queryFn: notificationsApi.listNotifications, staleTime: 30_000 });

  const setItems = (update: (items: AppNotification[]) => AppNotification[]) => {
    const previous = queryClient.getQueryData<AppNotification[]>(notificationsQueryKey);
    queryClient.setQueryData<AppNotification[]>(notificationsQueryKey, (items) => update(items ?? []));
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { previous?: AppNotification[] }) =>
    queryClient.setQueryData(notificationsQueryKey, ctx?.previous);

  const remove = useMutation({
    mutationFn: notificationsApi.deleteNotification,
    onMutate: (id: string) => setItems((items) => items.filter((n) => n.id !== id)),
    onError: rollback,
  });
  const clear = useMutation({
    mutationFn: notificationsApi.clearNotifications,
    onMutate: () => setItems(() => []),
    onError: rollback,
  });

  return {
    items: list.data ?? [],
    remove: (id: string) => remove.mutate(id),
    clear: () => clear.mutate(),
  };
}
