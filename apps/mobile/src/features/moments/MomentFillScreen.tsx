import { useQueryClient } from "@tanstack/react-query";
import { fillLayout, framingOrNull, notificationsQueryKey, type MomentFraming } from "@tng/shared";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ImagePlus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { LibraryPickGrid } from "@/features/gallery/components/LibraryPickGrid";
import { FormModal } from "@/features/profile/components/FormModal";
import { useTheme } from "@/hooks/useTheme";
import { momentsApi } from "@/services";

import { MomentFramer, type FramerPhoto } from "./components/MomentFramer";
import { toFramerPhoto } from "./framerPhoto";
import { useMomentInbox } from "./useMomentInbox";

/**
 * `/moment-fill?id=` (inbox → an invitation with empty frames of yours; web `MomentFillDialog`):
 * pick photos from your library, choose which of your frames each goes to, frame them, send.
 */
export function MomentFillScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const inbox = useMomentInbox();
  const target = inbox.invitations.find((m) => m.id === id) ?? null;

  // My empty frame → the photo placed there.
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [photos, setPhotos] = useState<Record<string, FramerPhoto>>({});
  const [framings, setFramings] = useState<Record<string, MomentFraming>>({});
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mySlots = useMemo(() => [...(target?.myPendingSlots ?? [])].sort((a, b) => a - b), [target]);
  const pickedSlots = mySlots.filter((slot) => placed[slot]);
  const pickedIds = pickedSlots.map((slot) => placed[slot]);

  const toggle = (mediaId: string) =>
    setPlaced((prev) => {
      const at = Object.keys(prev).find((slot) => prev[Number(slot)] === mediaId);
      if (at !== undefined) {
        const next = { ...prev };
        delete next[Number(at)];
        return next;
      }
      const free = mySlots.find((slot) => !prev[slot]);
      return free === undefined ? prev : { ...prev, [free]: mediaId };
    });

  const move = (from: number, to: number) =>
    setPlaced((prev) => {
      const next = { ...prev };
      const a = prev[from];
      const b = prev[to];
      delete next[from];
      delete next[to];
      if (a) next[to] = a;
      if (b) next[from] = b;
      return next;
    });

  const send = async () => {
    if (!target) return;
    setPosting(true);
    setError(null);
    try {
      await momentsApi.fillMomentSlots(
        target.id,
        pickedIds,
        pickedIds.map((m) => framingOrNull(framings[m])),
        pickedSlots,
      );
      void queryClient.invalidateQueries({ queryKey: ["moments"] });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPosting(false);
    }
  };

  if (picking) {
    return (
      <FormModal
        title={t("moments.pickPhotos")}
        action={t("moments.donePicking")}
        canSubmit
        saving={false}
        onSubmit={() => setPicking(false)}
        leading={{ icon: ChevronLeft, label: t("common.back"), onPress: () => setPicking(false) }}
        scroll={false}
      >
        <LibraryPickGrid
          includeVideos
          browse
          hint={t("moments.pickMax", { n: mySlots.length })}
          selectedIds={pickedIds}
          bottomInset={insets.bottom}
          onSelect={(item) => {
            setPhotos((prev) => ({ ...prev, [item.id]: toFramerPhoto(item) }));
            toggle(item.id);
          }}
        />
      </FormModal>
    );
  }

  return (
    <FormModal
      title={t("moments.fillSlotTitle", { n: mySlots.length || 1 })}
      action={t("moments.confirmFill")}
      canSubmit={Boolean(target) && pickedIds.length > 0}
      saving={posting}
      onSubmit={() => void send()}
    >
      {!target ? (
        inbox.isPending ? (
          <ActivityIndicator className="py-10" color={colors.mutedForeground} />
        ) : (
          <Text className="py-10 text-center text-[14px] text-muted-foreground">{t("moments.noInvitations")}</Text>
        )
      ) : (
        <>
          {error ? <Text className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</Text> : null}
          <Text className="text-[14px] text-muted-foreground">
            {t("moments.fillSlotDesc", { user: target.userName, n: mySlots.length })}
          </Text>
          <Button variant="outline" onPress={() => setPicking(true)}>
            <Icon as={ImagePlus} size={16} />
            <Text>
              {t("moments.pickPhotos")} ({pickedIds.length}/{mySlots.length})
            </Text>
          </Button>
          {pickedIds.length ? (
            <View>
              <MomentFramer
                photos={pickedIds.map((m) => photos[m]).filter(Boolean)}
                layout={fillLayout(target.slots, Object.fromEntries(pickedSlots.map((slot, i) => [slot, i])))}
                framings={framings}
                onFrame={(m, f) => setFramings((prev) => ({ ...prev, [m]: f }))}
                canPlace={(slot) => mySlots.includes(slot)}
                onMove={move}
                width={Math.min(width - 64, 300)}
              />
            </View>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
