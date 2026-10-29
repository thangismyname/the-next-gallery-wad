import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  searchAlbums,
  searchGalleryObjects,
  searchGallerySemantic,
  type AlbumSearchResult,
  type MediaListItem,
} from "@/services/media";
import { searchFriend, type FriendSearchResult } from "@/services/friends";

export interface SpotlightResults {
  friends: FriendSearchResult[];
  albums: AlbumSearchResult[];
  /** Ảnh — search kết hợp CLIP + tag + YOLO (có score / scoreParts). */
  media: MediaListItem[];
  /** Ảnh có vật thể YOLO khớp (score = confidence). */
  objects: MediaListItem[];
  loading: boolean;
  error: string | null;
}

export const EMPTY_SPOTLIGHT: SpotlightResults = {
  friends: [],
  albums: [],
  media: [],
  objects: [],
  loading: false,
  error: null,
};

/**
 * Tìm đa nguồn cho Spotlight: gọi song song bạn bè · album · ảnh (hybrid) ·
 * vật thể; nguồn nào lỗi thì nguồn đó rỗng (các nguồn khác vẫn hiện). Đổi câu
 * → huỷ request cũ (AbortController). `query` nên đã debounce.
 * `scope` (favorites | label:<id> | album:<id>) → chỉ tìm ảnh trong phạm vi đó
 * (câu trống = liệt kê ảnh trong phạm vi).
 */
export function useSpotlightSearch(query: string, scope?: string | null) {
  const { t } = useTranslation();
  const [results, setResults] = useState<SpotlightResults>(EMPTY_SPOTLIGHT);

  useEffect(() => {
    const q = query.trim();
    if (!q && !scope) {
      setResults(EMPTY_SPOTLIGHT);
      return;
    }

    const controller = new AbortController();
    setResults((prev) => ({ ...prev, loading: true, error: null }));

    if (scope) {
      // Trong phạm vi: ảnh (kết hợp) + vật thể YOLO — vật thể chỉ khi đã gõ chữ.
      Promise.all([
        searchGallerySemantic(q, controller.signal, scope),
        q ? searchGalleryObjects(q, controller.signal, scope).catch(() => []) : [],
      ])
        .then(([media, objects]) => {
          if (!controller.signal.aborted) setResults({ ...EMPTY_SPOTLIGHT, media, objects });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults({ ...EMPTY_SPOTLIGHT, error: t("search.error") });
          }
        });
      return () => controller.abort();
    }

    Promise.allSettled([
      searchFriend(q).catch(() => null),
      searchAlbums(q, controller.signal),
      searchGallerySemantic(q, controller.signal),
      searchGalleryObjects(q, controller.signal),
    ])
      .then(([friendRes, albumRes, mediaRes, objectRes]) => {
        if (controller.signal.aborted) return;
        setResults({
          friends:
            friendRes.status === "fulfilled" && friendRes.value ? [friendRes.value] : [],
          albums: albumRes.status === "fulfilled" ? albumRes.value : [],
          media: mediaRes.status === "fulfilled" ? mediaRes.value : [],
          objects: objectRes.status === "fulfilled" ? objectRes.value : [],
          loading: false,
          error: null,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults((prev) => ({ ...prev, loading: false, error: t("search.error") }));
        }
      });

    return () => controller.abort();
  }, [query, scope, t]);

  /** Xoá kết quả ngay (vd mở lại Spotlight) — không chờ debounce. */
  const reset = useCallback(() => setResults(EMPTY_SPOTLIGHT), []);

  return { results, reset };
}
