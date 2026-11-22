import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/tabs";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";
import { LIQUID_GLASS } from "@/lib/glass";
import { APP_DURATION, PRESS_TIMING, SLIDE_TIMING } from "@/lib/motion";

import type { AppTab } from "./AppTabs";
import {
  BOTTOM_BAR_ITEM_GAP,
  BOTTOM_BAR_ITEM_H,
  BOTTOM_BAR_ITEM_W,
  BOTTOM_BAR_PADDING,
  floatingBarOffset,
} from "./layout";
import { setTabBarHidden, useTabBarScroll } from "./tabBarScroll";

const STEP = BOTTOM_BAR_ITEM_W + BOTTOM_BAR_ITEM_GAP;

/** Touch feedback — subtle, no bounce. */
const BAR_PRESSED_SCALE = 1.03;
const PILL_LIFT_SCALE = 1.1;
/** Extra horizontal stretch of the pill per px/s of drag velocity (max +22%). */
const STRETCH_PER_VELOCITY = 1 / 6000;
const MAX_STRETCH = 0.22;
const QUICK = { duration: APP_DURATION.fast } as const;

/**
 * Tint over the glass: dark = black (a bit darker than the stock material); light =
 * milky white so the bar stands out from photos / the ivory background. Still see-through.
 */
const GLASS_TINT = { dark: "rgba(0,0,0,0.38)", light: "rgba(255,255,255,0.6)" } as const;

type Props = BottomTabBarProps & {
  tabs: AppTab[];
  /** Selection mode: the screen's SelectionBar takes this spot. */
  hidden?: boolean;
};

const tick = () => {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
};

/**
 * Bar background: native interactive Liquid Glass on iOS 26+ (tinted darker),
 * frosted blur + the same tint on older iOS, solid pill on Android.
 */
function Surface({ isDark, children }: { isDark: boolean; children: ReactNode }) {
  const pill = { borderRadius: 9999, padding: BOTTOM_BAR_PADDING } as const;
  const tint = isDark ? GLASS_TINT.dark : GLASS_TINT.light;
  if (LIQUID_GLASS) {
    return (
      <GlassView
        isInteractive
        glassEffectStyle="regular"
        tintColor={tint}
        colorScheme={isDark ? "dark" : "light"}
        style={pill}
      >
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === "ios") {
    return (
      <View className="rounded-full shadow-lg shadow-black/20">
        <BlurView
          intensity={70}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          className="border border-border/60"
          style={[pill, { overflow: "hidden", backgroundColor: tint }]}
        >
          {children}
        </BlurView>
      </View>
    );
  }
  return (
    <View className="rounded-full shadow-lg shadow-black/20">
      <View className="overflow-hidden rounded-full border border-border bg-white dark:bg-secondary" style={pill}>
        {children}
      </View>
    </View>
  );
}

/** Capsule behind the active tab; lifts while touched and stretches with drag speed. */
function ActiveIndicator({
  x,
  lift,
  stretch,
  visible,
}: {
  x: SharedValue<number>;
  /** Animated scale (1 → PILL_LIFT_SCALE while touched). */
  lift: SharedValue<number>;
  /** Animated extra horizontal scale from drag speed. */
  stretch: SharedValue<number>;
  visible: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, QUICK),
    transform: [{ translateX: x.get() }, { scaleX: lift.get() + stretch.get() }, { scaleY: lift.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute left-0 top-0 rounded-full bg-foreground/10"
      style={[{ width: BOTTOM_BAR_ITEM_W, height: BOTTOM_BAR_ITEM_H }, style]}
    />
  );
}

/**
 * Two stacked icons (muted / full color) cross-faded by whether this slot is the
 * highlighted one — the active tab, or the one under the finger while dragging —
 * so icons light up as the pill passes over them.
 */
function TabIcon({ icon, index, highlighted }: { icon: LucideIcon; index: number; highlighted: SharedValue<number> }) {
  const on = useAnimatedStyle(() => ({ opacity: withTiming(highlighted.get() === index ? 1 : 0, QUICK) }));
  const off = useAnimatedStyle(() => ({ opacity: withTiming(highlighted.get() === index ? 0 : 1, QUICK) }));
  return (
    <View>
      <Animated.View style={off}>
        {/* Light: darker than muted-foreground so idle tabs read well on the white glass. */}
        <Icon as={icon} size={23} className="text-neutral-600 dark:text-muted-foreground" />
      </Animated.View>
      <Animated.View style={on} className="absolute inset-0">
        <Icon as={icon} size={23} className="text-foreground" />
      </Animated.View>
    </View>
  );
}

/**
 * Plan B tab bar (`AppTabs` with `NATIVE_TAB_BAR = false`): floating glass bar, icons only.
 * Touch: the bar swells slightly and the pill lifts. Tap a tab, or drag along the
 * bar — the pill follows the finger (stretching with speed), icons light up as it
 * passes, a haptic tick per tab, release opens the tab under the finger.
 * Scroll down (`tabBarScroll`): shrinks to just the active tab (like iOS 26 minimize); tap it or scroll
 * up to expand.
 */
export function BottomBar({ state, navigateToTab, tabs, hidden }: Props) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const activeIndex = tabs.findIndex((tab) => tab.name === current);
  const maxX = (tabs.length - 1) * STEP;
  const fullWidth = tabs.length * BOTTOM_BAR_ITEM_W + (tabs.length - 1) * BOTTOM_BAR_ITEM_GAP;
  const compact = useTabBarScroll((s) => s.hidden);

  const x = useSharedValue(Math.max(activeIndex, 0) * STEP);
  const pressed = useSharedValue(false);
  const dragging = useSharedValue(false);
  const lift = useSharedValue(1);
  const stretch = useSharedValue(0);
  const highlighted = useSharedValue(activeIndex);

  useEffect(() => {
    highlighted.set(activeIndex);
    if (activeIndex >= 0 && !dragging.get()) x.set(withTiming(activeIndex * STEP, SLIDE_TIMING));
  }, [activeIndex, x, dragging, highlighted]);

  const openTab = (index: number) => {
    const route = state.routes.find((r) => r.name === tabs[index]?.name);
    if (route && index !== activeIndex) navigateToTab(route.key);
  };

  // One gesture for the whole bar: touch-down feedback (onBegin) + horizontal drag
  // (activates after 8px, so a simple tap still reaches the tab's Pressable).
  const pan = usePanGesture({
    enabled: !compact, // shrunk = one slot, nothing to drag along
    activeOffsetX: [-8, 8],
    failOffsetY: [-20, 20],
    onBegin: () => {
      "worklet";
      pressed.set(true);
      lift.set(withTiming(PILL_LIFT_SCALE, PRESS_TIMING));
    },
    onActivate: () => {
      "worklet";
      dragging.set(true);
    },
    onUpdate: (e) => {
      "worklet";
      const pos = Math.min(Math.max(e.x - BOTTOM_BAR_ITEM_W / 2, 0), maxX);
      x.set(pos);
      stretch.set(withTiming(Math.min(Math.abs(e.velocityX) * STRETCH_PER_VELOCITY, MAX_STRETCH), { duration: 90 }));
      const index = Math.round(pos / STEP);
      if (index !== highlighted.get()) {
        highlighted.set(index);
        scheduleOnRN(tick);
      }
    },
    onDeactivate: () => {
      "worklet";
      const index = Math.round(x.get() / STEP);
      x.set(withTiming(index * STEP, SLIDE_TIMING));
      scheduleOnRN(openTab, index);
    },
    onFinalize: () => {
      "worklet";
      pressed.set(false);
      dragging.set(false);
      lift.set(withTiming(1, SLIDE_TIMING));
      stretch.set(withTiming(0, SLIDE_TIMING));
    },
  });

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.get() ? BAR_PRESSED_SCALE : 1, PRESS_TIMING) }],
  }));

  // Shrink: the visible window narrows to one slot and the row slides so the active tab stays in it.
  const shrink = useSharedValue(0);
  useEffect(() => {
    shrink.set(withTiming(compact ? 1 : 0, SLIDE_TIMING));
  }, [compact, shrink]);
  const windowStyle = useAnimatedStyle(() => ({
    width: interpolate(shrink.get(), [0, 1], [fullWidth, BOTTOM_BAR_ITEM_W]),
  }));
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -Math.max(activeIndex, 0) * STEP * shrink.get() }],
  }));

  if (hidden) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ bottom: floatingBarOffset(insets.bottom) }}
    >
      <Animated.View style={barStyle}>
        <Surface isDark={isDark}>
          <Animated.View className="overflow-hidden" style={windowStyle}>
          <GestureDetector gesture={pan}>
            <Animated.View className="flex-row items-center" style={[{ gap: BOTTOM_BAR_ITEM_GAP, width: fullWidth }, rowStyle]}>
              <ActiveIndicator x={x} lift={lift} stretch={stretch} visible={activeIndex >= 0} />
              {tabs.map(({ name, icon, labelKey, badge }, index) => {
                const route = state.routes.find((r) => r.name === name);
                if (!route) return null;
                const active = current === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="tab"
                    accessibilityLabel={t(labelKey)}
                    accessibilityState={{ selected: active }}
                    className="items-center justify-center rounded-full"
                    style={{ width: BOTTOM_BAR_ITEM_W, height: BOTTOM_BAR_ITEM_H }}
                    onPress={() => {
                      tick();
                      // Shrunk bar: the visible tab is the active one → tapping it expands the bar.
                      if (compact) setTabBarHidden(false);
                      else openTab(index);
                    }}
                  >
                    <TabIcon icon={icon} index={index} highlighted={highlighted} />
                    {badge && !active ? (
                      <View className="absolute right-3 top-2 size-2.5 rounded-full border-2 border-background bg-primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </Animated.View>
          </GestureDetector>
          </Animated.View>
        </Surface>
      </Animated.View>
    </View>
  );
}
