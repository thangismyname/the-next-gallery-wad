import { Image } from "expo-image";
import { Images, type LucideIcon } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { View } from "react-native";

import { PressableScale } from "@/components/shared/PressableScale";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Square cover + title + subtitle — albums, auto albums and collections
 * (web `CoverCard`). `leading` = small icon / color dot before the title,
 * `overlay` = badges on the cover (dark-on-image), `footer` = extra row
 * (invitation buttons).
 */
export const CoverCard = memo(function CoverCard({
  size,
  title,
  subtitle,
  cover,
  icon = Images,
  iconClass,
  leading,
  overlay,
  footer,
  onPress,
}: {
  size: number;
  title: string;
  subtitle: string;
  cover: string | null;
  /** Placeholder icon without a cover. */
  icon?: LucideIcon;
  iconClass?: string;
  leading?: ReactNode;
  overlay?: ReactNode;
  footer?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <View style={{ width: size }} className="gap-2">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        disabled={!onPress}
        onPress={onPress}
        scaleTo={0.97}
        className="gap-2"
      >
        <View className="items-center justify-center overflow-hidden rounded-3xl bg-muted" style={{ width: size, height: size }}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Icon as={icon} size={Math.min(36, size / 4)} className={cn("text-muted-foreground/50", iconClass)} />
          )}
          {overlay ? (
            <View pointerEvents="none" className="absolute left-2 top-2 flex-row gap-1">
              {overlay}
            </View>
          ) : null}
        </View>
        <View className="gap-0.5 px-1">
          <View className="flex-row items-center gap-1.5">
            {leading}
            <Text numberOfLines={1} className="flex-1 text-[16px] font-semibold">
              {title}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-[14px] text-muted-foreground">
            {subtitle}
          </Text>
        </View>
      </PressableScale>
      {footer}
    </View>
  );
});

/** Small pill on a cover (on the photo → dark-on-image). */
export function CoverBadge({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5">
      <Icon as={icon} size={12} className="text-white" />
      <Text className="text-[11px] font-semibold text-white">{label}</Text>
    </View>
  );
}
