import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Header icon row (glass buttons). */
export const HEADER_ROW = 52;
/** Extra row under it where the big centered title sits while at the top. */
export const HEADER_TITLE_ROW = 56;
/** Scroll distance over which the title collapses to the left. */
export const HEADER_COLLAPSE_DISTANCE = 64;
/** Floating BottomBar: tab capsule size, spacing, inner padding. */
export const BOTTOM_BAR_ITEM_W = 58;
export const BOTTOM_BAR_ITEM_H = 46;
export const BOTTOM_BAR_ITEM_GAP = 2;
export const BOTTOM_BAR_PADDING = 4;
export const BOTTOM_BAR_HEIGHT = BOTTOM_BAR_ITEM_H + BOTTOM_BAR_PADDING * 2;
/**
 * Distance from the screen bottom: sits inside the home-indicator area (like the
 * iOS 26 tab bar) instead of above it; 10px on devices without one.
 */
export const bottomBarOffset = (safeBottom: number) => Math.max(safeBottom - 14, 10);

/**
 * Padding a tab screen's scroll content needs so it starts below the expanded
 * header and can scroll fully past the floating BottomBar (the header and bar are
 * transparent / glass, so content scrolls *under* them). `left` / `right` = the
 * notch / Dynamic Island side insets in landscape.
 */
export function useTabContentInsets() {
  const { top, bottom, left, right } = useSafeAreaInsets();
  return {
    top: top + HEADER_ROW + HEADER_TITLE_ROW,
    bottom: bottomBarOffset(bottom) + BOTTOM_BAR_HEIGHT + 16,
    left,
    right,
  };
}
