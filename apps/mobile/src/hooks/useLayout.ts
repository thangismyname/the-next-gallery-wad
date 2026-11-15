import { useWindowDimensions } from "react-native";

/** Shortest side ≥ 600pt = tablet / unfolded foldable (Material + Apple size classes). */
const TABLET_MIN_SIDE = 600;

/**
 * Responsive facts for the current window (updates on rotation, iPad split view /
 * Stage Manager, foldables opening). Size by **width**, never by device model.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;
  return {
    width,
    height,
    isTablet,
    isLandscape: width > height,
    /** Readable width for forms / cards, centered on wide screens. */
    formWidth: Math.min(width - 32, isTablet ? 460 : 420),
  };
}
