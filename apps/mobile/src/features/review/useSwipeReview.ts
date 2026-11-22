import { createSwipeReviewStore } from "@tng/shared";

import { mediaApi } from "@/services";

/** "Swipe to clean" queue — logic shared with web (`@tng/shared` `stores/swipeReview.ts`). */
export const useSwipeReview = createSwipeReviewStore({
  fetchMedia: (offset, limit) => mediaApi.fetchMedia(offset, limit),
  moveToTrash: mediaApi.moveToTrash,
  restoreMedia: mediaApi.restoreMedia,
  setFavorite: mediaApi.setFavorite,
});
