import { ActivityIndicator } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { APP_DURATION } from "@/lib/motion";

export const PULL_REFRESH_DISTANCE = 80;
const SIZE = 36;

/**
 * iOS pull-to-refresh spinner for lists that scroll under the transparent header
 * (the native RefreshControl would sit behind the header / Dynamic Island). Fades
 * and grows with the overscroll, stays while `refreshing`. `top` = where the
 * content starts (below the header).
 */
export function PullRefreshIndicator({
  scrollY,
  refreshing,
  top,
}: {
  scrollY: SharedValue<number>;
  refreshing: boolean;
  top: number;
}) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => {
    const pull = Math.max(-scrollY.get(), 0);
    const progress = interpolate(pull, [12, PULL_REFRESH_DISTANCE], [0, 1], Extrapolation.CLAMP);
    const shown = refreshing ? 1 : progress;
    return {
      opacity: refreshing ? withTiming(1, { duration: APP_DURATION.fast }) : shown,
      transform: [
        // Centered in the gap that opens above the content while pulling.
        { translateY: Math.max(pull / 2 - SIZE / 2, 0) },
        { scale: 0.6 + 0.4 * shown },
      ],
    };
  }, [refreshing]);

  return (
    <Animated.View
      pointerEvents="none"
      className="absolute self-center items-center justify-center rounded-full border border-border/60 bg-background/80"
      style={[{ top, width: SIZE, height: SIZE }, style]}
    >
      <ActivityIndicator size="small" color={colors.foreground} />
    </Animated.View>
  );
}
