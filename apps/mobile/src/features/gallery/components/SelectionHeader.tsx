import { useSelectionStore } from "@tng/shared";
import { X } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { HEADER_ROW } from "@/features/navigation/layout";

/**
 * Replaces the AppHeader in selection mode: ✕ (leave) · "N selected" · Select all.
 * Same row height + side insets as the AppHeader so nothing jumps.
 */
export function SelectionHeader({ allIds }: { allIds: string[] }) {
  const { t } = useTranslation();
  const { top, left, right } = useSafeAreaInsets();
  const count = useSelectionStore((s) => s.selectedIds.size);
  const clear = useSelectionStore((s) => s.clear);
  const allSelected = count > 0 && count >= allIds.length;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-10 flex-row items-center gap-2.5 px-4"
      style={{ paddingTop: top, paddingLeft: left + 16, paddingRight: right + 16, height: top + HEADER_ROW }}
    >
      <GlassButton size={40} accessibilityLabel={t("selection.cancel")} onPress={clear}>
        <Icon as={X} size={20} />
      </GlassButton>
      <View className="flex-1 flex-row">
        <GlassPanel radius={999} padding={0} materialize>
          <Text className="px-4 py-2.5 text-base font-semibold" accessibilityLiveRegion="polite">
            {t("selection.count", { count })}
          </Text>
        </GlassPanel>
      </View>
      <GlassPanel radius={999} padding={0} materialize>
        <Text
          accessibilityRole="button"
          onPress={() =>
            allSelected
              ? useSelectionStore.setState({ selectedIds: new Set(), isSelecting: true })
              : useSelectionStore.setState({ selectedIds: new Set(allIds), isSelecting: true })
          }
          className="px-4 py-2.5 text-base font-medium"
        >
          {allSelected ? t("gallery.selection.cancel") : t("selection.selectAll")}
        </Text>
      </GlassPanel>
    </View>
  );
}
