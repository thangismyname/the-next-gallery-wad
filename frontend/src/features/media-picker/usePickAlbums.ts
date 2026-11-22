// Album để chọn ảnh trong picker (menu "Album ▾"): album thường + album tự động, tên đã dịch.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { albumsQueryKey, autoAlbumsQueryKey, pickAlbums } from "@tng/shared";
import { fetchAlbums, fetchAutoAlbums } from "@/services/albums";

export function usePickAlbums() {
  const { t, i18n } = useTranslation();
  const regular = useQuery({ queryKey: albumsQueryKey, queryFn: fetchAlbums, staleTime: 60_000 });
  const auto = useQuery({ queryKey: autoAlbumsQueryKey, queryFn: fetchAutoAlbums, staleTime: 5 * 60_000 });
  return useMemo(
    () => pickAlbums(regular.data, auto.data, t, i18n.language),
    [regular.data, auto.data, t, i18n.language],
  );
}
