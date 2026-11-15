import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Portal } from "@rn-primitives/portal";
import type { MediaListItem } from "@tng/shared";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useMemo, useRef, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, RefreshControl, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

import { GRID_GAP, chunkRows, gridCell, gridColumns } from "../gridLayout";
import type { Rect } from "../lightbox/geometry";
import { Lightbox, type LightboxAction } from "../lightbox/Lightbox";
import { useTileViewer } from "../useTileViewer";
import { MediaTile } from "./MediaTile";

export const GRID_BAR = 44;

/**
 * Pushed screen = floating glass back button (+ `topRight`) over a paged photo
 * grid with a list header, pull-to-refresh, load-more near the end and the
 * Lightbox (`<Portal name={portal}>`). Used by AI Studio tags, albums and auto
 * albums — screens only bring their data, header and empty state.
 */
export function MediaGridScreen<T extends MediaListItem>({
  items,
  portal,
  header,
  empty,
  isPending,
  isError,
  refreshing,
  onRefresh,
  hasNextPage,
  loadingMore,
  onLoadMore,
  badge,
  topRight,
  backLabel,
  lightboxActions,
  canEdit,
  onViewerClose,
  overlay,
}: {
  items: T[];
  portal: string;
  header: ReactNode;
  empty: ReactElement;
  isPending: boolean;
  isError: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Overlay on a tile (on the photo → dark-on-image). */
  badge?: (item: T) => ReactNode;
  topRight?: ReactNode;
  backLabel?: string;
  lightboxActions?: LightboxAction[];
  canEdit?: (item: MediaListItem) => boolean;
  onViewerClose?: () => void;
  /** Full-screen layer above the grid + bar (e.g. a ⋯ menu with its tap-outside backdrop). */
  overlay?: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const listWidth = width - insets.left - insets.right;
  const columns = gridColumns(listWidth);
  const cell = gridCell(listWidth, columns);
  const rows = useMemo(() => chunkRows(items, columns), [items, columns]);

  const listRef = useRef<FlashListRef<T[]>>(null);
  const { registerTile, viewer, setViewer, revealTile, getTileRect } = useTileViewer({
    items,
    columns,
    listRef,
    topInset: insets.top + GRID_BAR,
  });
  const openTile = useCallback((item: MediaListItem, rect: Rect) => setViewer({ id: item.id, rect }), [setViewer]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !loadingMore) onLoadMore();
  }, [hasNextPage, loadingMore, onLoadMore]);
  const closeViewer = useCallback(() => {
    setViewer(null);
    onViewerClose?.();
  }, [setViewer, onViewerClose]);

  const top = insets.top + 8 + GRID_BAR + 8;

  return (
    <View className="flex-1 bg-background">
      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row[0].id}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={top} />}
        contentContainerStyle={{
          paddingTop: top,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        ListHeaderComponent={<View className="pb-4">{header}</View>}
        renderItem={({ item: row }) => (
          <View className="flex-row" style={{ gap: GRID_GAP, marginBottom: GRID_GAP }}>
            {row.map((media) => (
              <View key={media.id}>
                <MediaTile item={media} size={cell} onPress={openTile} registerTile={registerTile} />
                {badge?.(media)}
              </View>
            ))}
          </View>
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="py-6" color={colors.mutedForeground} /> : null}
        ListEmptyComponent={
          isPending ? (
            <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
              {Array.from({ length: columns * 4 }, (_, i) => (
                <Skeleton key={i} className="rounded-none" style={{ width: cell, height: cell }} />
              ))}
            </View>
          ) : isError ? (
            <View className="items-center gap-3 px-8 pt-16">
              <Text className="text-center text-base">{t("gallery.error.loadFailed")}</Text>
              <Button variant="outline" onPress={onRefresh}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </View>
          ) : (
            empty
          )
        }
      />

      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0 flex-row items-center justify-between gap-2.5"
        style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
      >
        <GlassButton size={GRID_BAR} accessibilityLabel={backLabel ?? t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
        <View pointerEvents="box-none" className="flex-row items-center gap-2.5">
          {refreshing ? <ActivityIndicator color={colors.mutedForeground} /> : null}
          {topRight}
        </View>
      </View>

      {overlay}

      {viewer && items.length ? (
        <Portal name={portal}>
          <Lightbox
            items={items}
            startId={viewer.id}
            originRect={viewer.rect}
            getTileRect={getTileRect}
            onEndReached={loadMore}
            onIndexChange={(id) => void revealTile(id)}
            onClose={closeViewer}
            actions={lightboxActions}
            canEdit={canEdit}
          />
        </Portal>
      ) : null}
    </View>
  );
}
