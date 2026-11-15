import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { PULL_REFRESH_DISTANCE } from "@/components/shared/PullRefreshIndicator";

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
 */
export function useHeaderScroll(options?: { onPullRefresh?: () => void }) {
  const scrollY = useSharedValue(0);
  const onPull = options?.onPullRefresh;

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollY.set(e.contentOffset.y);
      },
      onEndDrag: (e) => {
        if (onPull && e.contentOffset.y < -PULL_REFRESH_DISTANCE) scheduleOnRN(onPull);
      },
    },
    [onPull],
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
