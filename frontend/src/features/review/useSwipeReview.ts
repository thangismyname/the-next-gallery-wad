import { createSwipeReviewStore } from "@tng/shared";

import { fetchMedia, moveToTrash, restoreMedia, setFavorite } from "@/services/media";

/** Hàng đợi "Vuốt để dọn" (logic chung với mobile ở `@tng/shared` `stores/swipeReview.ts`). */
export const useSwipeReview = createSwipeReviewStore({
  fetchMedia: (offset, limit) => fetchMedia(offset, limit),
  moveToTrash,
  restoreMedia,
  setFavorite,
});
