import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const MIN = 0.05;
const MAX = 0.95;
const STEP = 0.05;
const THUMB = 26;
const SNAP = { duration: 90 };

/**
 * Confidence threshold (web `ConfidenceThreshold`): drag up → only photos the
 * model is sure of (precision), down → more photos but more mistakes (recall).
 * Steps of 5 % with a selection haptic each; the value is committed on release
 * (one query per gesture, not one per step). The tick = the tag's own threshold
 * ("Auto", picked on the validation set at train time).
 */
export function ConfidenceSlider({
  value,
  autoValue,
  onChange,
}: {
  /** null = the tag's auto threshold. */
  value: number | null;
  autoValue: number;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const effective = value ?? autoValue;
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? effective;

  const width = useSharedValue(0);
  const pos = useSharedValue(effective);
  const dragging = useSharedValue(false);
  useEffect(() => {
    if (!dragging.get()) pos.set(effective);
  }, [effective, pos, dragging]);

  const step = (v: number) => {
    setLive(v);
    void Haptics.selectionAsync();
  };
  const commit = (v: number) => {
    setLive(null);
    onChange(v);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onBegin(() => dragging.set(true))
    .onUpdate((e) => {
      const v = toValue(e.x, width.get());
      if (v !== pos.get()) {
        pos.set(v);
        scheduleOnRN(step, v);
      }
    })
    .onEnd(() => scheduleOnRN(commit, pos.get()))
    .onFinalize(() => dragging.set(false));
  const tap = Gesture.Tap().onEnd((e) => {
    const v = toValue(e.x, width.get());
    pos.set(v);
    scheduleOnRN(commit, v);
  });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(fraction(pos.get()) * width.get() - THUMB / 2, SNAP) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: withTiming(fraction(pos.get()) * width.get(), SNAP) }));

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-[14px] text-muted-foreground">{t("studio.threshold")}</Text>
        <View className="flex-row items-center gap-2">
          <Text className="w-12 text-right text-[17px] font-semibold tabular-nums">{Math.round(shown * 100)}%</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("studio.thresholdAutoHint")}
            accessibilityState={{ selected: value === null }}
            onPress={() => onChange(null)}
            className={cn("h-8 justify-center rounded-full px-3", value === null ? "bg-foreground" : "bg-muted")}
          >
            <Text className={cn("text-[13px] font-medium", value === null && "text-background")}>
              {t("studio.thresholdAuto")}
            </Text>
          </Pressable>
        </View>
      </View>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t("studio.threshold")}
          accessibilityValue={{ text: `${Math.round(shown * 100)}%` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const delta = e.nativeEvent.actionName === "increment" ? STEP : -STEP;
            commit(clamp(effective + delta));
          }}
          onLayout={(e) => width.set(e.nativeEvent.layout.width)}
          className="h-8 justify-center"
        >
          <View className="h-1.5 overflow-hidden rounded-full bg-muted">
            <Animated.View className="h-full bg-foreground" style={fillStyle} />
          </View>
          {/* Auto threshold tick */}
          <View
            pointerEvents="none"
            className="absolute h-3.5 w-0.5 rounded-full bg-muted-foreground/60"
            style={{ left: `${fraction(autoValue) * 100}%` }}
          />
          <Animated.View
            pointerEvents="none"
            className="absolute rounded-full border border-border bg-background shadow-md shadow-black/20"
            style={[{ width: THUMB, height: THUMB }, thumbStyle]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

function clamp(v: number) {
  "worklet";
  return Number(Math.min(MAX, Math.max(MIN, Math.round(v / STEP) * STEP)).toFixed(2));
}
function toValue(x: number, width: number) {
  "worklet";
  return width > 0 ? clamp(MIN + (x / width) * (MAX - MIN)) : MIN;
}
function fraction(v: number) {
  "worklet";
  return (v - MIN) / (MAX - MIN);
}
