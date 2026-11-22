import type { MediaListItem } from "@tng/shared";

import type { FramerPhoto } from "./components/MomentFramer";

/** Library item → what the mobile framer draws (video = its poster). */
export const toFramerPhoto = (m: MediaListItem): FramerPhoto => ({
  id: m.id,
  src: m.displayUrl ?? m.thumbnailUrl,
  width: m.width || 1,
  height: m.height || 1,
});
