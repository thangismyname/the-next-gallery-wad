import { useSelectionStore, type MediaListItem } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { Download, Ellipsis, Heart, Share as ShareIcon, Trash2, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
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

import { PhotosPermissionError, useMediaActions } from "../useMediaActions";
import { MediaMenu } from "./MediaMenu";

type Busy = "share" | "favorite" | "save" | "trash" | null;

/**
 * Glass action bar for the selected photos — takes the BottomBar's spot (the
 * BottomBar hides itself in selection mode). Share (one photo: system sheet) ·
 * Favorite (all hearted → un-heart) · Save to Photos (with progress) · Trash ·
 * ⋯ (add to album, labels) whose menu opens above the bar.
 */
export function SelectionBar({ items }: { items: MediaListItem[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useMediaActions();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const selected = items.filter((m) => selectedIds.has(m.id));
  const ids = selected.map((m) => m.id);
  const count = ids.length;
  const allFavorite = count > 0 && selected.every((m) => m.isFavorite);

  const showToast = (text: string, ms = 2200) => {
    setToast(text);
    setTimeout(() => setToast((v) => (v === text ? null : v)), ms);
  };

  const run = async (kind: Busy, fn: () => Promise<void>, done?: () => string) => {
    if (busy || count === 0) return;
    setBusy(kind);
    try {
      await fn();
      if (done) showToast(done());
    } catch (error) {
      showToast(t(error instanceof PhotosPermissionError ? "lightbox.savePermission" : "lightbox.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (count !== 1) return showToast(t("selection.shareOne"));
    void run("share", () => actions.share(selected[0]));
  };

  const favorite = () =>
    void run("favorite", async () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await actions.setFavoriteMany(ids, !allFavorite);
      clear();
    });

  const save = () =>
    void run(
      "save",
      async () => {
        showToast(t("selection.saving", { done: 0, total: count }), 60_000);
        await actions.saveManyToPhotos(selected, (done) =>
          setToast(t("selection.saving", { done, total: count })),
        );
        clear();
      },
      () => t("selection.savedMany", { count }),
    );

  const trash = () => {
    if (count === 0) return;
    Alert.alert(t("selection.deleteConfirmTitle"), t("selection.deleteConfirmDesc", { count }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("selection.moveToTrash"),
        style: "destructive",
        onPress: () =>
          void run(
            "trash",
            async () => {
              await actions.moveManyToTrash(ids);
              clear();
            },
            () => t("selection.trashedMany", { count }),
          ),
      },
    ]);
  };

  const bottom = floatingBarOffset(insets.bottom);

  return (
    <>
      {/* Tap outside the ⋯ menu closes it. */}
      {menuOpen ? <Pressable onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} /> : null}

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
        <View pointerEvents="box-none" className="items-end gap-2.5">
          {menuOpen ? (
            <MediaMenu
              mediaIds={ids}
              origin="bottom right"
              onNotify={(text) => showToast(text)}
              onDone={() => {
                setMenuOpen(false);
                clear();
              }}
            />
          ) : null}
          <GlassPanel radius={999} padding={4} materialize>
            <View className="flex-row items-center gap-1.5">
              <BarButton icon={ShareIcon} label={t("selection.share")} busy={busy === "share"} disabled={count !== 1} onPress={share} color={colors.foreground} />
              <BarButton
                icon={Heart}
                label={t(allFavorite ? "selection.unfavorite" : "selection.favorite")}
                filled={allFavorite}
                busy={busy === "favorite"}
                disabled={count === 0}
                onPress={favorite}
                color={colors.foreground}
              />
              <BarButton icon={Download} label={t("selection.download")} busy={busy === "save"} disabled={count === 0} onPress={save} color={colors.foreground} />
              <BarButton icon={Trash2} label={t("selection.delete")} busy={busy === "trash"} disabled={count === 0} onPress={trash} color={colors.foreground} />
              <BarButton
                icon={Ellipsis}
                label={t("lightbox.more")}
                disabled={count === 0}
                onPress={() => setMenuOpen((v) => !v)}
                color={colors.foreground}
              />
            </View>
          </GlassPanel>
        </View>
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
  filled,
  color,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  filled?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      className="size-[46px] items-center justify-center rounded-full active:bg-foreground/10"
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Icon
          as={icon}
          size={22}
          className={cn("text-foreground", disabled && "text-muted-foreground")}
          fill={filled ? "currentColor" : "none"}
        />
      )}
    </Pressable>
  );
}
