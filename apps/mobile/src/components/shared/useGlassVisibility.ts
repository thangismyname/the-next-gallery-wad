import type { GlassEffectStyleConfig, GlassStyle } from "expo-glass-effect";
import { useEffect, useState } from "react";
import { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { LIQUID_GLASS } from "@/lib/glass";
import { APP_DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Show / hide a glass surface without fading it (opacity breaks Liquid Glass):
 * the glass (de)materializes natively ("regular" ↔ "none", animated) while the
 * content inside fades. `materialize` = also animate in on mount.
 *
 * Returns the `glassEffectStyle` for the GlassView and an animated style for the
 * content wrapper. On non-glass fallbacks (blur / solid) `fallbackStyle` fades
 * the whole surface instead.
 */
export function useGlassVisibility(visible: boolean, materialize = false) {
  const target: GlassStyle = visible ? "regular" : "none";
  const [glassStyle, setGlassStyle] = useState<GlassStyle | GlassEffectStyleConfig>(
    LIQUID_GLASS && (materialize || !visible) ? "none" : "regular",
  );

  useEffect(() => {
    if (!LIQUID_GLASS) return;
    // Next frame: the native view must exist with the old style for the change to animate.
    const frame = requestAnimationFrame(() =>
      setGlassStyle({ style: target, animate: true, animationDuration: APP_DURATION.base / 1000 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: APP_DURATION.fast, easing: EASE_OUT }),
  }));

  return { glassStyle, contentStyle, fallbackStyle: contentStyle };
}
