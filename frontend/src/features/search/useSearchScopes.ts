import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { albumsQueryKey, fetchAlbums } from "@/services/albums";
import { useLabels } from "@/features/favorites/useLabels";
import { LANGUAGES } from "@/lib/languages";
import { buildScopes } from "./searchScope";

/**
 * Các phạm vi Spotlight có thể chọn: Yêu thích · từng nhãn · album thường
 * (album thông minh đã là 1 câu tìm, bỏ qua) · ảnh đã chỉnh sửa (sắp có).
 */
export function useSearchScopes(enabled: boolean) {
  const { t, i18n } = useTranslation();
  const { labels } = useLabels(enabled);
  const { data: albums } = useQuery({
    queryKey: albumsQueryKey,
    queryFn: fetchAlbums,
    enabled,
    staleTime: 60_000,
  });

  return useMemo(
    () =>
      buildScopes({
        favoritesName: t("favorites.title"),
        editedName: t("search.scope.edited"),
        // Nhãn gợi ý chưa đổi tên: gõ tên ở ngôn ngữ nào cũng ra ("print", "in ảnh").
        labels: labels.map((l) => ({
          ...l,
          aliases: l.suggested
            ? LANGUAGES.map(({ code }) =>
                i18n.getFixedT(code)(`favorites.labels.suggested.${l.preset}`),
              )
            : [],
        })),
        albums: [...(albums?.owned ?? []), ...(albums?.shared ?? [])].filter(
          (a) => a.kind === "manual",
        ),
      }),
    [t, i18n, labels, albums],
  );
}
