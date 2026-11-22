import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Platform } from "react-native";
import { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { PULL_REFRESH_DISTANCE } from "@/components/shared/PullRefreshIndicator";

import { nextTabBarHidden, setTabBarHidden } from "./tabBarScroll";

const pullTick = () => {
  if (Platform.OS === "ios") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

/**
 * Scroll position for the collapsing `AppHeader`, tracked on the UI thread.
 * Pass `onScroll` to an Animated scroll view / list (`scrollEventThrottle={16}`)
 * and `scrollY` to `<AppHeader>`.
 *
 * `onPullRefresh` (iOS): releasing an overscroll past PULL_REFRESH_DISTANCE calls
 * it (haptic when the threshold is crossed) — pair with `PullRefreshIndicator`.
 *
 * Also hides the tab bar while scrolling down (`tabBarScroll.ts`); `hideTabBar: false` for screens
 * laid out around the bar (Moments pager).
 */
export function useHeaderScroll(options?: { onPullRefresh?: () => void; hideTabBar?: boolean }) {
  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const barHidden = useSharedValue(false);
  const onPull = options?.onPullRefresh;
  const hideTabBar = options?.hideTabBar ?? true;

  useFocusEffect(
    useCallback(() => {
      barHidden.set(false);
      setTabBarHidden(false);
    }, [barHidden]),
  );

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        const y = e.contentOffset.y;
        scrollY.set(y);
        if (hideTabBar) {
          const next = nextTabBarHidden(y, y - lastY.get(), barHidden.get());
          if (next !== barHidden.get()) {
            barHidden.set(next);
            scheduleOnRN(setTabBarHidden, next);
          }
        }
        lastY.set(y);
      },
      onEndDrag: (e) => {
        if (onPull && e.contentOffset.y < -PULL_REFRESH_DISTANCE) scheduleOnRN(onPull);
      },
    },
    [onPull, hideTabBar],
  );

  useAnimatedReaction(
    () => scrollY.get() < -PULL_REFRESH_DISTANCE,
    (past, wasPast) => {
      if (onPull && past && wasPast === false) scheduleOnRN(pullTick);
    },
    [onPull],
  );

  return { scrollY, onScroll };
}
