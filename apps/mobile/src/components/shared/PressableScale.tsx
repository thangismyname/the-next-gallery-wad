import type { ComponentRef, Ref } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { PRESS_TIMING } from "@/lib/motion";

type Props = PressableProps & {
  /** Scale while pressed (default 0.95). */
  scaleTo?: number;
  /** Style of the animated wrapper (position / size); `className` goes to the Pressable. */
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ComponentRef<typeof Pressable>>;
};

/**
 * Pressable that eases down a little while touched (UI thread, no bounce). Drop-in for buttons and
 * for `asChild` triggers — props and ref go to the inner Pressable.
 */
export function PressableScale({ scaleTo = 0.95, containerStyle, onPressIn, onPressOut, ref, ...props }: Props) {
  const pressed = useSharedValue(false);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value ? scaleTo : 1, PRESS_TIMING) }],
  }));
  return (
    <Animated.View style={[style, containerStyle]}>
      <Pressable
        ref={ref}
        onPressIn={(e) => {
          pressed.value = true;
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = false;
          onPressOut?.(e);
        }}
        {...props}
      />
    </Animated.View>
  );
}
