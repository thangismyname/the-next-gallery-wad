import { FlashList } from "@shopify/flash-list";
import type { MediaListItem } from "@tng/shared";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MediaTile } from "@/features/gallery/components/MediaTile";
import { GRID_GAP, chunkRows, gridCell, gridColumns } from "@/features/gallery/gridLayout";
import { useGalleryMedia } from "@/features/gallery/useGalleryMedia";
import { useTheme } from "@/hooks/useTheme";

/** The user's library photos (no videos), newest first — tap = select one (web `MediaPicker` max 1). */
export function AvatarLibraryGrid({
  selectedId,
  onSelect,
  bottomInset,
}: {
  selectedId: string | null;
  onSelect: (item: MediaListItem) => void;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { items, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useGalleryMedia("newest");
  const photos = useMemo(() => items.filter((m) => m.mediaType !== "video"), [items]);
  const columns = gridColumns(width);
  const cell = gridCell(width, columns);
  const rows = useMemo(() => chunkRows(photos, columns), [photos, columns]);
  const press = useCallback((item: MediaListItem) => onSelect(item), [onSelect]);

  return (
    <FlashList
      data={rows}
      extraData={selectedId}
      keyExtractor={(row) => row[0].id}
      onEndReached={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
      onEndReachedThreshold={1.5}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      ListHeaderComponent={
        <Text className="px-4 pb-3 text-[14px] text-muted-foreground">{t("profile.avatarPickDesc")}</Text>
      }
      renderItem={({ item: row }) => (
        <View className="flex-row" style={{ gap: GRID_GAP, marginBottom: GRID_GAP }}>
          {row.map((m) => (
            <MediaTile key={m.id} item={m} size={cell} onPress={press} selected={m.id === selectedId} />
          ))}
        </View>
      )}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator className="py-6" color={colors.mutedForeground} /> : null}
      ListEmptyComponent={
        isPending ? (
          <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
            {Array.from({ length: columns * 4 }, (_, i) => (
              <Skeleton key={i} className="rounded-none" style={{ width: cell, height: cell }} />
            ))}
          </View>
        ) : (
          <Text className="px-8 pt-16 text-center text-[15px] text-muted-foreground">{t("gallery.empty")}</Text>
        )
      }
    />
  );
}
