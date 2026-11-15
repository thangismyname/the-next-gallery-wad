import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { PRESS_TIMING, SLIDE_TIMING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SIZE = 76;

/**
 * Big round shutter: white disc (photo) · red disc (video) · white disc in an
 * rose ring (moment: tap = photo, hold = video) · rounded square while
 * recording. Shrinks a little while pressed. Always white / red / rose on the
 * camera feed (not theme colors — it sits on a live picture).
 */
export function ShutterButton({
  video,
  moment = false,
  recording,
  disabled,
  label,
  hint,
  onPress,
  onPressIn,
  onPressOut,
}: {
  video: boolean;
  moment?: boolean;
  recording: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  onPress?: () => void;
  /** Hold gestures (Moments). */
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const pressed = useSharedValue(0);
  const rec = useSharedValue(recording ? 1 : 0);
  useEffect(() => {
    rec.set(withTiming(recording ? 1 : 0, SLIDE_TIMING));
  }, [recording, rec]);

  const inner = useAnimatedStyle(() => {
    const r = rec.get();
    const size = 62 - r * 32;
    return {
      width: size,
      height: size,
      borderRadius: size / 2 - r * (size / 2 - 8),
      transform: [{ scale: withTiming(pressed.get() ? 0.88 : 1, PRESS_TIMING) }],
    };
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPressIn={() => {
        pressed.set(1);
        onPressIn?.();
      }}
      onPressOut={() => {
        pressed.set(0);
        onPressOut?.();
      }}
      onPress={onPress}
      className={cn(
        "items-center justify-center rounded-full border-4",
        moment ? (recording ? "border-red-500" : "border-rose-400") : "border-white",
      )}
      style={{ width: SIZE, height: SIZE }}
    >
      <Animated.View className={video || (moment && recording) ? "bg-red-500" : "bg-white"} style={inner} />
    </Pressable>
  );
}
