import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { LIQUID_GLASS } from "@/lib/glass";

import { useGlassVisibility } from "./useGlassVisibility";

/**
 * Rounded glass surface: native Liquid Glass on iOS 26+, frosted blur on older
 * iOS, translucent card color on Android (no real-time blur there). Needs
 * something behind it to look like glass. Used by menus, the auth card, the
 * Lightbox bars.
 *
 * `visible={false}` hides it the glass way (dematerialize + content fade, no
 * opacity on the glass); `materialize` animates it in on mount.
 */
export function GlassPanel({
  children,
  radius = 22,
  padding = 6,
  style,
  materialize = false,
  visible = true,
  fill = false,
}: {
  children: ReactNode;
  radius?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  materialize?: boolean;
  visible?: boolean;
  /**
   * Fill the parent's height and let children use `flex: 1` (every wrapper in
   * the chain gets `flex: 1` — otherwise a `flex-1` child collapses to 0).
   */
  fill?: boolean;
}) {
  const { isDark } = useTheme();
  const { glassStyle, contentStyle, fallbackStyle } = useGlassVisibility(visible, materialize);
  const shape = { borderRadius: radius, overflow: "hidden" as const, padding };
  const pointerEvents = visible ? "auto" : "none";
  const grow = fill ? { flex: 1 } : null;

  if (LIQUID_GLASS) {
    return (
      <GlassView
        pointerEvents={pointerEvents}
        glassEffectStyle={glassStyle}
        colorScheme={isDark ? "dark" : "light"}
        style={[shape, grow, style]}
      >
        <Animated.View style={[grow, contentStyle]}>{children}</Animated.View>
      </GlassView>
    );
  }
  if (Platform.OS === "ios") {
    return (
      <Animated.View pointerEvents={pointerEvents} style={[grow, fallbackStyle]}>
        <BlurView
          intensity={80}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          className="border border-border/60"
          style={[shape, grow, style]}
        >
          {children}
        </BlurView>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents={pointerEvents} style={[grow, fallbackStyle]}>
      <View className="border border-border bg-popover/90" style={[shape, grow, style]}>
        {children}
      </View>
    </Animated.View>
  );
}
