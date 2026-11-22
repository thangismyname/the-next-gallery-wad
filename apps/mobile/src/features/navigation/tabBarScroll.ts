import { create } from "zustand";

/**
 * Tab bar hidden while scrolling down (to read content), shown again on scroll up / near the top.
 * Fed by `useHeaderScroll` (tab screens) and `WorkspaceScreen` (Admin / Developer); read by the
 * `NativeTabs` layouts. Reset to visible when a screen gains focus.
 */
export const useTabBarScroll = create<{ hidden: boolean }>(() => ({ hidden: false }));
export const setTabBarHidden = (hidden: boolean) => {
  if (useTabBarScroll.getState().hidden !== hidden) useTabBarScroll.setState({ hidden });
};

/** Above this offset the bar always shows; a move ≥ STEP pt flips it (ignores jitter). */
export const TAB_BAR_SHOW_ABOVE = 48;
export const TAB_BAR_SCROLL_STEP = 6;

/** Next hidden state from the scroll offset `y`, its change `dy` and the current state. Worklet-safe. */
export function nextTabBarHidden(y: number, dy: number, hidden: boolean) {
  "worklet";
  if (y <= TAB_BAR_SHOW_ABOVE) return false;
  if (dy >= TAB_BAR_SCROLL_STEP) return true;
  if (dy <= -TAB_BAR_SCROLL_STEP) return false;
  return hidden;
}
