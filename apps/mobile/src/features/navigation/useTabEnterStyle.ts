import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { APP_DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Tab switch transition for the **content only** (list / scroll view): fades in
 * and rises 6px each time the tab gains focus. The navigator's own tab animation
 * is off because it fades the whole scene — including the header's Liquid Glass
 * buttons and menus, which stop rendering glass under an ancestor with
 * opacity < 1. Header + BottomBar stay still, like native iOS bars.
 */
export function useTabEnterStyle() {
  const progress = useSharedValue(1);
  const reduce = useReducedMotion();

  useFocusEffect(
    useCallback(() => {
      if (reduce) return;
      progress.set(0);
      progress.set(withTiming(1, { duration: APP_DURATION.base, easing: EASE_OUT }));
    }, [progress, reduce]),
  );

  return useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 6 }],
  }));
}
