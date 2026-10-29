import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLabel,
  deleteLabel,
  fetchLabels,
  labelsQueryKey,
  mediaLabelsQueryKey,
  seedLabels,
  setLabelMedia,
  updateLabel,
  type LabelColor,
  type SavedMediaItem,
  type UserLabel,
  type UserLabelDto,
} from "@/services/labels";

/** Tên hiển thị: tên user đặt, hoặc tên nhãn gợi ý theo ngôn ngữ đang dùng. */
export function labelDisplayName(label: UserLabelDto, t: TFunction) {
  return (
    label.name ??
    t(`favorites.labels.suggested.${label.preset}`, { defaultValue: label.preset ?? "" })
  );
}

/**
 * Danh sách nhãn của user. Lần đầu (server báo `seeded: false`) tự tạo 3 nhãn
 * gợi ý — lưu theo key nên tên đổi theo ngôn ngữ, cho tới khi user tự đổi tên.
 * `enabled` false → không gọi API (vd dialog đang đóng, link công khai).
 */
export function useLabels(enabled = true) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: labelsQueryKey,
    queryFn: fetchLabels,
    staleTime: 30_000,
    enabled,
  });

  const seeding = useRef(false);
  useEffect(() => {
    if (!query.data || query.data.seeded || seeding.current) return;
    seeding.current = true;
    seedLabels()
      .then((data) => queryClient.setQueryData(labelsQueryKey, data))
      .catch(() => {});
  }, [query.data, queryClient]);

  const dtos = query.data?.labels;
  const labels = useMemo<UserLabel[]>(
    () => (dtos ?? []).map((l) => ({ ...l, name: labelDisplayName(l, t), suggested: l.name === null })),
    // i18n.language: đổi ngôn ngữ → tên nhãn gợi ý đổi theo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dtos, t, i18n.language],
  );

  return {
    labels,
    totals: query.data?.totals ?? { all: 0, favorites: 0 },
    isPending: query.isPending,
    isError: query.isError,
  };
}

/** Thao tác nhãn: tạo / sửa / xoá nhãn, gắn / gỡ nhãn cho ảnh. */
export function useLabelActions() {
  const queryClient = useQueryClient();

  // Số ảnh của nhãn + trang Yêu thích (["favorites", filter]) đổi theo.
  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: labelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["favorites"] }),
      ]),
    [queryClient],
  );

  /** Nhãn đã biết của các ảnh (từ cache trang Yêu thích + Lightbox). */
  const knownLabelIds = useCallback(
    (mediaId: string) => {
      const single = queryClient.getQueryData<{ labelIds: string[] }>(
        mediaLabelsQueryKey(mediaId),
      );
      if (single) return single.labelIds;
      for (const [, data] of queryClient.getQueriesData<{ items: SavedMediaItem[] }>({
        queryKey: ["favorites"],
      })) {
        const item = data?.items.find((m) => m.id === mediaId);
        if (item) return item.labelIds;
      }
      return [];
    },
    [queryClient],
  );

  const toggleMedia = useCallback(
    async (labelId: string, mediaIds: string[], labeled: boolean) => {
      // Lightbox đổi ngay, không chờ server.
      for (const id of mediaIds) {
        queryClient.setQueryData<{ editable: boolean; labelIds: string[] }>(
          mediaLabelsQueryKey(id),
          (old) =>
            old && {
              ...old,
              labelIds: labeled
                ? [...new Set([...old.labelIds, labelId])]
                : old.labelIds.filter((x) => x !== labelId),
            },
        );
      }
      try {
        await setLabelMedia(labelId, mediaIds, labeled);
      } finally {
        await refresh();
      }
    },
    [queryClient, refresh],
  );

  const create = useCallback(
    async (name: string, color: LabelColor) => {
      const label = await createLabel({ name, color });
      await refresh();
      return label;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, body: { name?: string; color?: LabelColor }) => {
      await updateLabel(id, body);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteLabel(id);
      await refresh();
    },
    [refresh],
  );

  return { knownLabelIds, toggleMedia, create, update, remove };
}
