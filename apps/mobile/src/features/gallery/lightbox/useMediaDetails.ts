import { useQuery } from "@tanstack/react-query";
import { mediaTagsQueryKey, type MediaListItem } from "@tng/shared";

import { albumsApi, mediaApi } from "@/services";

/** YOLO stores objects from 0.25 but search trusts them from this (backend AI_YOLO_MIN_CONF). */
export const YOLO_SEARCH_MIN_CONF = 0.4;

export const detailKeys = {
  detections: (id: string) => ["ai", "detections", id] as const,
  similar: (id: string) => ["ai", "similar", id] as const,
  containing: (id: string) => ["albums", "containing", id] as const,
};

/**
 * AI + organization details of one photo for the Lightbox info sheet. Fetched
 * only while the sheet is open (`active`) and cached per photo, so paging with
 * the sheet open stays cheap. Videos have no tags / objects / similar photos.
 */
export function useMediaDetails(item: MediaListItem, active: boolean) {
  const id = item.id;
  const photo = item.mediaType !== "video";
  const tags = useQuery({
    queryKey: mediaTagsQueryKey(id),
    queryFn: () => mediaApi.fetchMediaTags(id),
    enabled: active && photo,
    staleTime: 60_000,
  });
  const detections = useQuery({
    queryKey: detailKeys.detections(id),
    queryFn: () => mediaApi.fetchMediaDetections(id),
    enabled: active && photo,
    staleTime: 60_000,
  });
  const similar = useQuery({
    queryKey: detailKeys.similar(id),
    queryFn: () => mediaApi.fetchSimilarMedia(id, 12),
    enabled: active && photo,
    staleTime: 5 * 60_000,
  });
  const albums = useQuery({
    queryKey: detailKeys.containing(id),
    queryFn: () => albumsApi.fetchAlbumsContaining(id),
    enabled: active,
    staleTime: 60_000,
  });

  // One chip per YOLO class: highest confidence + how many times it was found.
  const objects = new Map<string, { confidence: number; count: number }>();
  for (const det of detections.data ?? []) {
    const o = objects.get(det.class_name);
    if (o) {
      o.count += 1;
      o.confidence = Math.max(o.confidence, det.confidence);
    } else objects.set(det.class_name, { confidence: det.confidence, count: 1 });
  }

  return {
    photo,
    tags: tags.data ?? [],
    objects: [...objects.entries()].sort((a, b) => b[1].confidence - a[1].confidence),
    similar: similar.data ?? null,
    similarLoading: similar.isPending && active && photo,
    albums: albums.data ?? [],
  };
}
