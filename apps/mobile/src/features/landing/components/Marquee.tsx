import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";

/** pt/s — chậm, chỉ để "sống" (web Marquee). */
const SPEED = 28;

/** Băng chữ chạy vô tận (2 bản nối nhau, trượt đúng 1 bản rồi lặp). Reduce Motion → đứng yên. */
export function Marquee({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const [rowWidth, setRowWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduce || rowWidth === 0) return;
    x.set(0);
    x.set(withRepeat(withTiming(-rowWidth, { duration: (rowWidth / SPEED) * 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(x);
  }, [reduce, rowWidth, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const row = (copy: number) => (
    <View
      key={copy}
      className="flex-row items-center"
      onLayout={copy === 0 ? (e) => setRowWidth(e.nativeEvent.layout.width) : undefined}
    >
      {items.map((item) => (
        <View key={item} className="flex-row items-center">
          <Text className="text-xs font-medium uppercase tracking-[2px] text-muted-foreground">{item}</Text>
          <Text className="mx-4 text-xs text-muted-foreground/60">✦</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View className="overflow-hidden border-y border-border/60 py-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View className="flex-row" style={style}>
        {row(0)}
        {row(1)}
      </Animated.View>
    </View>
  );
}
