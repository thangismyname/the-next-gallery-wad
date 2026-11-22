import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Header icon row (glass buttons). */
export const HEADER_ROW = 52;
/** Extra row under it where the big centered title sits while at the top. */
export const HEADER_TITLE_ROW = 56;
/** Scroll distance over which the title collapses to the left. */
export const HEADER_COLLAPSE_DISTANCE = 64;
/**
 * Which tab bar the app uses (Admin + Developer workspaces too) — see `AppTabs`:
 * - true  = plan A: system tab bar (`NativeTabs`): real UITabBar / Material bar, iOS 26 minimize on scroll,
 *           sidebar on iPad / large iPhones. Size fixed by the OS.
 * - false = plan B: our floating glass `BottomBar` (Liquid Glass via `GlassView`): small like the old bar,
 *           drag along it to switch, shrinks to the active tab on scroll down (iOS-like) on both platforms.
 */
export const NATIVE_TAB_BAR = true;

/** Plan A: native bar height above the bottom safe area — can't be measured from JS → platform constants.
 *  shortcut: iPad / sidebar layouts put the bar at the top — the bottom space is then just extra padding. */
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : 80;

/** Plan B bar (and our other floating glass bars: gallery / trash `SelectionBar`): capsule size, spacing,
 *  padding, height + distance from the bottom (inside the home-indicator area like the iOS 26 bar, 10px
 *  on devices without one). */
export const BOTTOM_BAR_ITEM_W = 58;
export const BOTTOM_BAR_ITEM_H = 46;
export const BOTTOM_BAR_ITEM_GAP = 2;
export const BOTTOM_BAR_PADDING = 4;
export const FLOATING_BAR_HEIGHT = BOTTOM_BAR_ITEM_H + BOTTOM_BAR_PADDING * 2;
export const floatingBarOffset = (safeBottom: number) => Math.max(safeBottom - 14, 10);

/** Space the tab bar takes from the screen bottom (content scrolls under it, so pad by this). */
export const tabBarSpace = (safeBottom: number) =>
  NATIVE_TAB_BAR ? safeBottom + TAB_BAR_HEIGHT : floatingBarOffset(safeBottom) + FLOATING_BAR_HEIGHT;

/**
 * Padding a tab screen's scroll content needs so it starts below the expanded
 * header and can scroll fully past the native tab bar (the header and bar are
 * transparent / glass, so content scrolls *under* them). `left` / `right` = the
 * notch / Dynamic Island side insets in landscape.
 */
export function useTabContentInsets() {
  const { top, bottom, left, right } = useSafeAreaInsets();
  return {
    top: top + HEADER_ROW + HEADER_TITLE_ROW,
    bottom: tabBarSpace(bottom) + 16,
    left,
    right,
  };
}
