import type { MediaListItem } from "@tng/shared";

/** Image URLs for the viewer: grid thumb (cached), `display` (≤2048px), original for deep zoom. */
export function mediaSources(item: MediaListItem) {
  const isHeic = /hei[cf]/i.test(item.mimeType ?? "");
  return {
    thumb: item.thumbnailUrlLarge ?? item.thumbnailUrl,
    display: item.displayUrl ?? item.thumbnailUrlLarge ?? item.thumbnailUrl,
    // HEIC originals can't be decoded everywhere → the server-made full-size WebP.
    original: item.fullUrl ?? (isHeic ? null : item.url),
  };
}
