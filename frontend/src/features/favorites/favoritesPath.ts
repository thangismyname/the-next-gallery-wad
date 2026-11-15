/** Trang Yêu thích nằm trong Albums; `filter` = "favorites" (chỉ ảnh thả tim) | id nhãn. */
export const FAVORITES_PATH = "/albums/favorites";

export const favoritesPath = (filter?: string) =>
  filter ? `${FAVORITES_PATH}?filter=${encodeURIComponent(filter)}` : FAVORITES_PATH;
