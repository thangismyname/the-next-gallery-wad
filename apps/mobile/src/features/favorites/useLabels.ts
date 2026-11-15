import { useQuery, useQueryClient } from "@tanstack/react-query";
import { labelsQueryKey, mediaLabelsQueryKey, type LabelColor, type UserLabel, labelDisplayName } from "@tng/shared";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { labelsApi } from "@/services";

/**
 * The user's personal labels (web `features/favorites/useLabels.ts`). First time
 * (`seeded: false`) the 3 suggested labels are created, like on the web.
 */
export function useLabels(enabled = true) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: labelsQueryKey, queryFn: labelsApi.fetchLabels, staleTime: 30_000, enabled });

  const seeding = useRef(false);
  useEffect(() => {
    if (!query.data || query.data.seeded || seeding.current) return;
    seeding.current = true;
    labelsApi
      .seedLabels()
      .then((data) => queryClient.setQueryData(labelsQueryKey, data))
      .catch(() => {});
  }, [query.data, queryClient]);

  const dtos = query.data?.labels;
  const lang = i18n.language;
  const labels = useMemo<UserLabel[]>(
    () => (dtos ?? []).map((l) => ({ ...l, name: labelDisplayName(l, t), suggested: l.name === null })),
    // lang: suggested names follow the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dtos, t, lang],
  );
  return {
    labels,
    totals: query.data?.totals ?? { all: 0, favorites: 0 },
    isPending: query.isPending,
    isError: query.isError,
  };
}

/** Labels of one photo (`editable` = own + not trashed). */
export function useMediaLabels(mediaId: string | undefined) {
  return useQuery({
    queryKey: mediaLabelsQueryKey(mediaId ?? ""),
    queryFn: () => labelsApi.fetchMediaLabels(mediaId as string),
    enabled: !!mediaId,
    staleTime: 30_000,
  });
}

/** Add / remove a label on photos — the single-photo cache flips at once. */
export function useLabelToggle() {
  const queryClient = useQueryClient();
  return useCallback(
    async (labelId: string, mediaIds: string[], labeled: boolean) => {
      for (const id of mediaIds) {
        queryClient.setQueryData<{ editable: boolean; labelIds: string[] }>(mediaLabelsQueryKey(id), (old) =>
          old
            ? {
                ...old,
                labelIds: labeled ? [...new Set([...old.labelIds, labelId])] : old.labelIds.filter((x) => x !== labelId),
              }
            : old,
        );
      }
      try {
        await labelsApi.setLabelMedia(labelId, mediaIds, labeled);
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: labelsQueryKey }),
          queryClient.invalidateQueries({ queryKey: ["favorites"] }),
        ]);
      }
    },
    [queryClient],
  );
}

/** API error → i18n key (duplicate name / too many labels), like the web dialog. */
export function labelErrorKey(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "LABEL_EXISTS") return "favorites.labels.exists";
  if (code === "LABEL_LIMIT") return "favorites.labels.limit";
  return "favorites.labels.failed";
}

/** Create / rename / recolor / delete labels; refreshes label counts + Favorites lists. */
export function useLabelActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: labelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["favorites"] }),
      ]),
    [queryClient],
  );
  const create = useCallback(
    async (name: string, color: LabelColor) => {
      const label = await labelsApi.createLabel({ name, color });
      await refresh();
      return label;
    },
    [refresh],
  );
  const update = useCallback(
    async (id: string, body: { name?: string; color?: LabelColor }) => {
      await labelsApi.updateLabel(id, body);
      await refresh();
    },
    [refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await labelsApi.deleteLabel(id);
      await refresh();
    },
    [refresh],
  );
  return { create, update, remove };
}
