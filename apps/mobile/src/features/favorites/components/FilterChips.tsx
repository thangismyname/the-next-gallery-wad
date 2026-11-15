import type { SavedFilter, UserLabel } from "@tng/shared";
import { Heart, Settings2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { LABEL_DOT } from "../labelColors";

/**
 * Filters (web FavoritesView): All · Hearted · each label (color dot + count),
 * then "Manage labels". Wraps onto several lines — no horizontal scroll (it
 * would fight the grid's sideways drag-select).
 */
export function FilterChips({
  filter,
  onChange,
  labels,
  totals,
  onManage,
}: {
  filter: SavedFilter;
  onChange: (filter: SavedFilter) => void;
  labels: UserLabel[];
  totals: { all: number; favorites: number };
  onManage: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-2 px-4">
      <Chip active={filter === "all"} count={totals.all} onPress={() => onChange("all")}>
        <Text className={chipText(filter === "all")}>{t("favorites.filters.all")}</Text>
      </Chip>
      <Chip active={filter === "favorites"} count={totals.favorites} onPress={() => onChange("favorites")}>
        <Icon
          as={Heart}
          size={14}
          className={filter === "favorites" ? "text-background" : "text-rose-500"}
          fill="currentColor"
        />
        <Text className={chipText(filter === "favorites")}>{t("favorites.filters.favorites")}</Text>
      </Chip>
      {labels.map((label) => (
        <Chip key={label.id} active={filter === label.id} count={label.count} onPress={() => onChange(label.id)}>
          <View className={cn("size-2.5 rounded-full", LABEL_DOT[label.color] ?? LABEL_DOT.slate)} />
          <Text numberOfLines={1} className={cn(chipText(filter === label.id), "max-w-40")}>
            {label.name}
          </Text>
        </Chip>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={onManage}
        className="h-9 flex-row items-center gap-1.5 rounded-full border border-dashed border-border px-3 active:opacity-60"
      >
        <Icon as={Settings2} size={14} className="text-muted-foreground" />
        <Text className="text-[14px] font-medium text-muted-foreground">{t("favorites.labels.manage")}</Text>
      </Pressable>
    </View>
  );
}

const chipText = (active: boolean) => cn("text-[14px] font-medium", active ? "text-background" : "text-foreground");

function Chip({
  active,
  count,
  onPress,
  children,
}: {
  active: boolean;
  count: number;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70",
        active ? "border-foreground bg-foreground" : "border-border bg-background/60",
      )}
    >
      {children}
      <Text className={cn("text-[13px]", active ? "text-background/70" : "text-muted-foreground")}>{count}</Text>
    </Pressable>
  );
}
