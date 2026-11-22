import type { TagSummary } from "@tng/shared";
import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { PressableScale } from "@/components/shared/PressableScale";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** One category: cover = its most confident photo, name + photo count over a bottom scrim (web `TagCategoryCard`). */
export const CategoryCard = memo(function CategoryCard({
  tag,
  icon,
  summary,
  width,
  onOpen,
}: {
  tag: string;
  icon: LucideIcon;
  summary?: TagSummary;
  width: number;
  onOpen: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const count = summary?.count ?? 0;
  const cover = count > 0 ? summary?.coverUrl : null;
  const name = t(`studio.tags.${tag}`);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t("studio.photoCount", { n: count })}`}
      onPress={() => onOpen(tag)}
      style={{ width, height: width * 0.75 }}
      className={cn("overflow-hidden rounded-3xl bg-muted", count === 0 && "opacity-60")}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          style={{ position: "absolute", inset: 0 }}
        />
      ) : (
        <View className="absolute inset-0 items-center justify-center pb-8">
          <Icon as={icon} size={30} className="text-muted-foreground/50" />
        </View>
      )}
      {/* Text on the photo → dark scrim + white text (dark-on-image, like the web card). No photo → no scrim
          (it drew a dark box on the muted tile) and theme-colored text. Unique gradient id per card. */}
      {cover ? (
        <Svg pointerEvents="none" width={width} height={width * 0.75 * 0.65} style={{ position: "absolute", left: 0, bottom: 0 }}>
          <Defs>
            <LinearGradient id={`scrim-${tag}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.72} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#scrim-${tag})`} />
        </Svg>
      ) : null}
      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 gap-0.5 p-3">
        <View className="flex-row items-center gap-1.5">
          <Icon as={icon} size={15} className={cover ? "text-white" : "text-foreground"} />
          <Text numberOfLines={1} className={cn("flex-1 text-[15px] font-semibold", cover ? "text-white" : "text-foreground")}>
            {name}
          </Text>
        </View>
        <Text className={cn("text-[12px]", cover ? "text-white/80" : "text-muted-foreground")}>{t("studio.photoCount", { n: count })}</Text>
      </View>
    </PressableScale>
  );
});
