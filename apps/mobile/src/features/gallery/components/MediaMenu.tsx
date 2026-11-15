import { ChevronLeft, FolderPlus, Images, Tag } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { GlassMenu, type GlassMenuItem } from "@/components/shared/GlassMenu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAddToAlbum } from "@/features/albums/useAddToAlbum";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import { useLabelToggle, useLabels, useMediaLabels } from "@/features/favorites/useLabels";


type Page = "root" | "albums" | "labels";

/**
 * "⋯" glass menu for one photo (Lightbox) or a selection: the caller's own items
 * (e.g. Share) + "Add to album ›" + "Labels ›". Sub-pages swap inside the same
 * glass panel (content fades, the glass stays).
 *
 * - One photo: labels show a check and toggle (the menu stays open).
 * - Several photos: tapping a label adds it to all of them.
 */
export function MediaMenu({
  mediaIds,
  items = [],
  onNotify,
  onDone,
  origin = "top right",
  library = true,
}: {
  mediaIds: string[];
  /** Root-page items before the album / label entries. */
  items?: GlassMenuItem[];
  /** Short feedback (already translated). */
  onNotify: (text: string) => void;
  /** Close the menu (after adding to an album). */
  onDone: () => void;
  origin?: "top right" | "top left" | "bottom right";
  /** false → only `items` (someone else's photo: no "Add to album" / "Labels"). */
  library?: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("root");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const single = mediaIds.length === 1 ? mediaIds[0] : undefined;

  const { albums, isPending: albumsPending, add } = useAddToAlbum(page === "albums");
  const { labels, isPending: labelsPending } = useLabels(page === "labels");
  const mediaLabels = useMediaLabels(page === "labels" ? single : undefined);
  const toggleLabel = useLabelToggle();
  const labelIds = new Set(mediaLabels.data?.labelIds ?? []);

  const fail = () => onNotify(t("lightbox.actionFailed"));

  const back = (title: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      onPress={() => setPage("root")}
      className="flex-row items-center gap-2 rounded-2xl px-2 py-2.5 active:bg-foreground/10"
    >
      <Icon as={ChevronLeft} size={20} className="text-foreground" />
      <Text className="text-base font-semibold">{title}</Text>
    </Pressable>
  );

  const placeholder = (text: string): GlassMenuItem[] => [{ key: "placeholder", label: text, onPress: () => {} }];

  if (page === "albums") {
    const albumItems: GlassMenuItem[] = albums.map((album) => ({
      key: album.id,
      label: album.name,
      icon: Images,
      busy: busyKey === album.id,
      onPress: () => {
        if (busyKey) return;
        setBusyKey(album.id);
        add(album.id, mediaIds)
          .then(() => {
            onNotify(t("lightbox.addedToAlbum", { name: album.name }));
            onDone();
          })
          .catch(fail)
          .finally(() => setBusyKey(null));
      },
    }));
    return (
      <GlassMenu
        contentKey="albums"
        width={270}
        origin={origin}
        maxHeight={320}
        header={back(t("albums.addTo"))}
        items={albumsPending ? placeholder("…") : albumItems.length ? albumItems : placeholder(t("lightbox.noAlbums"))}
      />
    );
  }

  if (page === "labels") {
    const labelItems: GlassMenuItem[] = labels.map((label) => {
      const on = labelIds.has(label.id);
      return {
        key: label.id,
        label: label.name,
        leading: (
          <View className="size-5 items-center justify-center">
            <View className={`size-3 rounded-full ${LABEL_DOT[label.color] ?? LABEL_DOT.slate}`} />
          </View>
        ),
        selected: single ? on : undefined,
        onPress: () => {
          if (single) {
            toggleLabel(label.id, mediaIds, !on).catch(fail);
          } else {
            toggleLabel(label.id, mediaIds, true)
              .then(() => onNotify(t("lightbox.labeled", { name: label.name })))
              .catch(fail);
          }
        },
      };
    });
    return (
      <GlassMenu
        contentKey="labels"
        width={270}
        origin={origin}
        maxHeight={320}
        header={back(t("favorites.labels.title"))}
        items={labelsPending ? placeholder("…") : labelItems.length ? labelItems : placeholder(t("favorites.labels.empty"))}
      />
    );
  }

  return (
    <GlassMenu
      contentKey="root"
      width={250}
      origin={origin}
      items={[
        ...items,
        ...(library
          ? [
              { key: "album", label: t("albums.addTo"), icon: FolderPlus, chevron: true, onPress: () => setPage("albums") },
              { key: "labels", label: t("favorites.labels.add"), icon: Tag, chevron: true, onPress: () => setPage("labels") },
            ]
          : []),
      ]}
    />
  );
}
