import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import type { ComponentRef, ReactNode, Ref } from "react";
import { Platform, Pressable, View, type PressableProps } from "react-native";

import Animated from "react-native-reanimated";

import { PressableScale } from "./PressableScale";
import { useGlassVisibility } from "./useGlassVisibility";

import { useTheme } from "@/hooks/useTheme";
import { LIQUID_GLASS } from "@/lib/glass";
import { cn } from "@/lib/utils";

type Props = Omit<PressableProps, "children"> & {
  children: ReactNode;
  /** Diameter in px (default 40). */
  size?: number;
  /** false → glass dematerializes + icon fades (never opacity on the glass). */
  visible?: boolean;
  ref?: Ref<ComponentRef<typeof Pressable>>;
};

/**
 * Round floating button on a glass chip: native Liquid Glass on iOS 26+, frosted
 * blur on older iOS, solid chip on Android. Works as a `DropdownMenuTrigger asChild`
 * (props + ref go to the Pressable). Springs down while pressed + haptic tick.
 */
export function GlassButton({ children, size = 40, visible = true, className, onPress, ref, ...props }: Props) {
  const { isDark } = useTheme();
  const { glassStyle, contentStyle, fallbackStyle } = useGlassVisibility(visible);
  const shape = { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" } as const;

  return (
    <PressableScale
      ref={ref}
      hitSlop={6}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="button"
      className={cn(className as string)}
      onPress={(e) => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress?.(e);
      }}
      {...props}
    >
      {LIQUID_GLASS ? (
        <GlassView isInteractive glassEffectStyle={glassStyle} colorScheme={isDark ? "dark" : "light"} style={shape}>
          <Animated.View style={contentStyle}>{children}</Animated.View>
        </GlassView>
      ) : Platform.OS === "ios" ? (
        <Animated.View style={fallbackStyle}>
        <BlurView
          intensity={60}
          tint={isDark ? "systemThinMaterialDark" : "systemThinMaterialLight"}
          className="border border-border/60"
          style={[shape, { overflow: "hidden" }]}
        >
          {children}
        </BlurView>
        </Animated.View>
      ) : (
        <Animated.View style={fallbackStyle}>
          <View className="border border-border bg-secondary" style={shape}>
            {children}
          </View>
        </Animated.View>
      )}
    </PressableScale>
  );
}
