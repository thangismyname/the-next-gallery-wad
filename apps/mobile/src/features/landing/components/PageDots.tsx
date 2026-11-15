import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  // Chấm đang xem dài ra (6 → 22pt) và đậm lên, chạy theo ngón tay khi vuốt.
  const style = useAnimatedStyle(() => {
    const d = width ? Math.abs(scrollX.get() / width - index) : 1;
    return {
      width: interpolate(d, [0, 1], [22, 6], Extrapolation.CLAMP),
      opacity: interpolate(d, [0, 1], [1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View className="h-1.5 rounded-full bg-foreground" style={style} />;
}

/** Chấm trang của carousel — bấm để nhảy tới trang đó. */
export function PageDots({
  count,
  scrollX,
  width,
  onSelect,
}: {
  count: number;
  scrollX: SharedValue<number>;
  width: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          hitSlop={8}
          onPress={() => onSelect(i)}
          accessibilityRole="button"
          accessibilityLabel={t("welcome.slide", { n: i + 1, total: count })}
        >
          <Dot index={i} scrollX={scrollX} width={width} />
        </Pressable>
      ))}
    </View>
  );
}
