import { useSelectionStore } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { RotateCcw, Trash2, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { floatingBarOffset } from "@/features/navigation/layout";
import { useTheme } from "@/hooks/useTheme";
import { fadeOut, riseIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { mediaApi } from "@/services";

type Busy = "restore" | "forever" | null;

/**
 * Trash selection bar (same glass pill + spot as the Library `SelectionBar`):
 * Restore · Delete forever (confirmed). A short toast says what happened;
 * `onDone` refreshes trash / library / storage.
 */
export function TrashSelectionBar({ onDone }: { onDone: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const count = selectedIds.size;

  const run = async (kind: Exclude<Busy, null>) => {
    const ids = [...selectedIds];
    if (busy || !ids.length) return;
    setBusy(kind);
    try {
      if (kind === "restore") await mediaApi.restoreMedia(ids);
      else await mediaApi.permanentDeleteMedia(ids);
      clear();
      await onDone();
      const text = t(kind === "restore" ? "trash.restoredMany" : "trash.deletedMany", { count: ids.length });
      setToast(text);
      setTimeout(() => setToast((v) => (v === text ? null : v)), 2200);
    } catch {
      Alert.alert(t("lightbox.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const deleteForever = () =>
    Alert.alert(t("trash.deleteForeverTitle"), t("trash.deleteForeverBatchDesc", { count }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("trash.deleteForever"), style: "destructive", onPress: () => void run("forever") },
    ]);

  const bottom = floatingBarOffset(insets.bottom);

  return (
    <>
      {toast ? (
        <Animated.View
          entering={riseIn}
          exiting={fadeOut}
          pointerEvents="none"
          className="absolute self-center rounded-full bg-foreground/90 px-4 py-2.5"
          style={{ bottom: bottom + 72 }}
        >
          <Text className="text-[15px] font-medium text-background">{toast}</Text>
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" className="absolute inset-x-0 items-center" style={{ bottom }}>
        <GlassPanel radius={999} padding={4} materialize>
          <View className="flex-row items-center gap-1">
            <BarButton
              icon={RotateCcw}
              label={t("trash.restore")}
              busy={busy === "restore"}
              disabled={count === 0 || busy !== null}
              onPress={() => void run("restore")}
              color={colors.foreground}
            />
            <BarButton
              icon={Trash2}
              label={t("trash.deleteForever")}
              destructive
              busy={busy === "forever"}
              disabled={count === 0 || busy !== null}
              onPress={deleteForever}
              color={colors.destructive}
            />
          </View>
        </GlassPanel>
      </View>
    </>
  );
}

function BarButton({
  icon,
  label,
  onPress,
  busy,
  disabled,
  destructive,
  color,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      className="h-[46px] flex-row items-center gap-2 rounded-full px-4 active:bg-foreground/10"
      style={{ opacity: disabled && !busy ? 0.45 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Icon as={icon} size={19} className={cn(destructive ? "text-destructive" : "text-foreground")} />}
      <Text className={cn("text-[15px] font-semibold", destructive && "text-destructive")}>{label}</Text>
    </Pressable>
  );
}
