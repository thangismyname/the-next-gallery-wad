import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Day title above a group of tiles. In selection mode (`allSelected` defined) a
 * "Select" / "Deselect" button on the right toggles the whole group.
 */
export const DayHeader = memo(function DayHeader({
  label,
  first,
  allSelected,
  onToggleGroup,
  groupKey,
}: {
  label: string;
  first: boolean;
  allSelected?: boolean;
  /** Called with the header row key. */
  onToggleGroup?: (groupKey: string) => void;
  groupKey?: string;
}) {
  const { t } = useTranslation();
  return (
    <View className={cn("flex-row items-end px-4 pb-2.5", first ? "pt-1" : "pt-6")}>
      <Text role="heading" className="flex-1 text-[17px] font-semibold">
        {label}
      </Text>
      {allSelected != null && onToggleGroup && groupKey ? (
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("gallery.selection.selectGroup", { group: label })}
          onPress={() => onToggleGroup(groupKey)}
          className="active:opacity-60"
        >
          <Text className="text-[15px] font-medium text-muted-foreground">
            {allSelected ? t("gallery.selection.cancel") : t("gallery.selection.select")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});
