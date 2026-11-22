import { FlashList, type FlashListProps, type FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { Portal } from "@rn-primitives/portal";
import { useSelectionStore, type MediaListItem } from "@tng/shared";
import { useFocusEffect } from "expo-router";
import { ArrowDownUp, ImageOff, RotateCw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, BackHandler, Platform, RefreshControl, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { PullRefreshIndicator } from "@/components/shared/PullRefreshIndicator";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import {
  AppHeader,
  useHeaderScroll,
  useTabContentInsets,
  useTabEnterStyle,
  type HeaderAction,
} from "@/features/navigation";
import { FLOATING_BAR_HEIGHT, HEADER_ROW, floatingBarOffset, tabBarSpace } from "@/features/navigation/layout";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";

import { DayHeader } from "./components/DayHeader";
import { GRID_RADIUS, MediaTile, type TileNode } from "./components/MediaTile";
import { SelectionBar } from "./components/SelectionBar";
import { SelectionHeader } from "./components/SelectionHeader";
import { buildGalleryRows, type GalleryRow } from "./galleryRows";
import type { Rect } from "./lightbox/geometry";
import { Lightbox } from "./lightbox/Lightbox";
import { GRID_GAP, gridColumns } from "./gridLayout";
import { useDragSelect, type DragSelectScroller } from "./useDragSelect";
import { useGalleryMedia } from "./useGalleryMedia";
import { RecentMoments } from "@/features/moments/components/RecentMoments";
import { SORT_OPTIONS, useGallerySort } from "./useGallerySort";

const GAP = GRID_GAP;
const galleryColumns = gridColumns;

// Reanimated version (FlashList's own AnimatedFlashList uses RN Animated) so the
// header scroll handler runs on the UI thread.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as ComponentType<
  FlashListProps<GalleryRow> & { onScroll?: unknown; ref?: Ref<FlashListRef<GalleryRow>> }
>;

/**
 * Library tab: all photos & videos, 3 columns, grouped by day (date sorts) or
 * first letter (name sorts), infinite scroll, pull to refresh. The sort button
 * sits under the avatar in the header. Scrolls under the transparent header and
 * the glass BottomBar.
 *
 * Selection mode (shared `useSelectionStore`): hold a tile (then drag for a
 * range), or drag sideways while selecting (`useDragSelect`); tap toggles; day
 * headers get Select / Deselect. The header becomes `SelectionHeader` and the
 * BottomBar gives way to `SelectionBar`. Leaving the tab / Android back exits.
 */
export function GalleryScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useTabContentInsets();
  const enterStyle = useTabEnterStyle();
  const listWidth = width - insets.left - insets.right;
  const columns = galleryColumns(listWidth);
  const cell = (listWidth - GAP * (columns - 1)) / columns;

  const { sort, setSort } = useGallerySort();
  const { items, total, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGalleryMedia(sort);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const { scrollY, onScroll } = useHeaderScroll({
    onPullRefresh: Platform.OS === "ios" ? () => void refresh() : undefined,
  });

  // A new sort remounts the list (key) at the top → reset the header too.
  useEffect(() => {
    scrollY.set(0);
  }, [sort, scrollY]);

  const sortAction: HeaderAction = {
    icon: ArrowDownUp,
    label: t("gallery.sort.label"),
    items: SORT_OPTIONS.map((option) => ({
      key: option.value,
      label: t(option.labelKey),
      selected: option.value === sort,
      onPress: () => setSort(option.value),
    })),
  };

  const lang = i18n.resolvedLanguage ?? i18n.language;
  const rows = useMemo(
    () =>
      buildGalleryRows(
        items,
        columns,
        sort,
        {
          today: t("gallery.group.today"),
          yesterday: t("gallery.group.yesterday"),
          undated: t("gallery.group.undated"),
        },
        lang,
      ),
    [items, columns, sort, lang, t],
  );

  // ── Selection ────────────────────────────────────────────────────────────
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clearSelection = useSelectionStore((s) => s.clear);
  const toggleSelected = useSelectionStore((s) => s.toggle);

  // Ids under each header row (for "select the whole day").
  const groupIds = useMemo(() => {
    const map = new Map<string, string[]>();
    let current: string[] = [];
    for (const row of rows) {
      if (row.type === "header") map.set(row.key, (current = []));
      else current.push(...row.items.map((m) => m.id));
    }
    return map;
  }, [rows]);
  const toggleGroup = useCallback(
    (key: string) => {
      const ids = groupIds.get(key) ?? [];
      const { selectedIds: sel } = useSelectionStore.getState();
      const next = new Set(sel);
      const all = ids.length > 0 && ids.every((id) => sel.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      useSelectionStore.setState({ selectedIds: next, isSelecting: true });
    },
    [groupIds],
  );
  const allIds = useMemo(() => items.map((m) => m.id), [items]);

  // Leave selection mode when the tab loses focus / unmounts; Android back exits it first.
  useFocusEffect(useCallback(() => () => clearSelection(), [clearSelection]));
  useEffect(() => {
    if (!isSelecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [isSelecting, clearSelection]);

  // ── Lightbox ─────────────────────────────────────────────────────────────
  const [viewer, setViewer] = useState<{ id: string; rect: Rect } | null>(null);
  const tiles = useRef(new Map<string, TileNode>());
  const registerTile = useCallback((id: string, node: TileNode | null) => {
    if (node) tiles.current.set(id, node);
    else tiles.current.delete(id);
  }, []);
  // Auto-scroll while drag-selecting: edges = below the selection header, above the selection bar.
  const listRef = useRef<FlashListRef<GalleryRow>>(null);
  const contentHeight = useRef(0);
  const safe = useSafeAreaInsets();
  const scroller: DragSelectScroller = {
    getOffset: () => scrollY.get(),
    getMaxOffset: () => contentHeight.current - height,
    scrollTo: (offset) => listRef.current?.scrollToOffset({ offset, animated: false }),
    edges: { top: safe.top + HEADER_ROW, bottom: height - floatingBarOffset(safe.bottom) - FLOATING_BAR_HEIGHT },
  };
  const { gesture: selectGesture, dragging: dragSelecting, swallowTap } = useDragSelect({ items, tiles, scroller });

  // ── Keep the grid under the Lightbox on the photo being viewed ────────────
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, i) => {
      if (row.type === "grid") for (const m of row.items) map.set(m.id, i);
    });
    return map;
  }, [rows]);
  const visibleTop = safe.top + HEADER_ROW;
  const visibleBottom = height - tabBarSpace(safe.bottom);
  const measureTile = useCallback(
    (id: string) =>
      new Promise<Rect | null>((resolve) => {
        const node = tiles.current.get(id);
        if (!node) return resolve(null);
        node.measureInWindow((x, y, w, h) => resolve(w > 0 ? { x, y, width: w, height: h } : null));
      }),
    [],
  );
  /** Scroll (no animation — the Lightbox covers the grid) so the tile is fully visible, centered. */
  const revealTile = useCallback(
    async (id: string) => {
      const rect = await measureTile(id);
      if (rect && rect.y >= visibleTop && rect.y + rect.height <= visibleBottom) return;
      const index = rowIndexById.get(id);
      if (index == null) return;
      await listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
    },
    [measureTile, rowIndexById, visibleTop, visibleBottom],
  );
  /** On-screen rect of a tile for the close flight (scrolls to it first if needed); null → shrink + fade. */
  const getTileRect = useCallback(
    async (id: string) => {
      await revealTile(id);
      // Let the scrolled rows mount / lay out.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = await measureTile(id);
      return rect && rect.y + rect.height > 0 && rect.y < height ? rect : null;
    },
    [revealTile, measureTile, height],
  );
  // Tap: toggle in selection mode, else open the Lightbox.
  const openViewer = useCallback(
    (item: MediaListItem, rect: Rect) => {
      if (swallowTap()) return;
      if (useSelectionStore.getState().isSelecting) toggleSelected(item.id);
      else setViewer({ id: item.id, rect });
    },
    [toggleSelected, swallowTap],
  );
  // The first tile row gets rounded outer top corners (Google Photos style sheet edge).
  const firstGridKey = useMemo(() => rows.find((row) => row.type === "grid")?.key, [rows]);

  const renderItem: ListRenderItem<GalleryRow> = useCallback(
    ({ item: row }) =>
      row.type === "header" ? (
        <DayHeader
          label={row.label}
          first={row.first}
          groupKey={row.key}
          onToggleGroup={toggleGroup}
          allSelected={
            isSelecting ? (groupIds.get(row.key) ?? []).every((id) => selectedIds.has(id)) : undefined
          }
        />
      ) : (
        <View className="flex-row" style={{ gap: GAP, marginBottom: GAP }}>
          {row.items.map((media, i) => (
            <MediaTile
              key={media.id}
              item={media}
              size={cell}
              onPress={openViewer}
              registerTile={registerTile}
              selected={isSelecting ? selectedIds.has(media.id) : undefined}
              roundTop={
                row.key === firstGridKey
                  ? { left: i === 0, right: i === row.items.length - 1, scrollY }
                  : undefined
              }
            />
          ))}
        </View>
      ),
    [cell, openViewer, registerTile, isSelecting, selectedIds, groupIds, toggleGroup, firstGridKey, scrollY],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <View className="flex-1 bg-background">
      {/* Content-only tab transition (the header's glass must not be faded). */}
      <GestureDetector gesture={selectGesture}>
      <Animated.View style={[{ flex: 1 }, enterStyle]}>
      <AnimatedFlashList
        ref={listRef}
        key={sort}
        onContentSizeChange={(_, h) => {
          contentHeight.current = h;
        }}
        data={rows}
        extraData={selectedIds}
        scrollEnabled={!dragSelecting}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        refreshControl={
          Platform.OS === "android" ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} progressViewOffset={insets.top} />
          ) : undefined
        }
        ListHeaderComponent={
          // Between the app title and the grid's curved top edge: the "Recent
          // moments" strip (hidden without moments), then the item count.
          <View>
            <RecentMoments />
            {total != null ? (
              <Animated.View entering={fadeIn}>
                <Text className="px-4 pb-1 text-[15px] text-muted-foreground">
                  {t("gallery.allPhotos.itemCount", { count: total })}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isPending ? (
            <GridSkeleton cell={cell} columns={columns} />
          ) : isError ? (
            <EmptyState icon={RotateCw} title={t("gallery.error.loadFailed")}>
              <Button variant="outline" onPress={() => void refetch()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </EmptyState>
          ) : (
            <EmptyState icon={ImageOff} title={t("gallery.empty")} hint={t("gallery.emptyHint")} />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center py-6">
              <ActivityIndicator color={colors.mutedForeground} />
            </View>
          ) : null
        }
      />
      </Animated.View>
      </GestureDetector>
      {Platform.OS === "ios" ? (
        <PullRefreshIndicator scrollY={scrollY} refreshing={refreshing} top={insets.top} />
      ) : null}
      {isSelecting ? (
        <>
          <SelectionHeader allIds={allIds} />
          <SelectionBar items={items} />
        </>
      ) : (
        <AppHeader scrollY={scrollY} action={sortAction} />
      )}
      {viewer ? (
        // Root PortalHost → above the tab bar too.
        <Portal name="lightbox">
          <Lightbox
            items={items}
            startId={viewer.id}
            originRect={viewer.rect}
            getTileRect={getTileRect}
            onEndReached={loadMore}
            onIndexChange={(id) => void revealTile(id)}
            onClose={() => setViewer(null)}
          />
        </Portal>
      ) : null}
    </View>
  );
}

/** First load: skeleton tiles in the real column layout. */
function GridSkeleton({ cell, columns }: { cell: number; columns: number }) {
  return (
    <View className="pt-9">
      <View className="flex-row flex-wrap" style={{ gap: GAP }}>
        {Array.from({ length: columns * 6 }, (_, i) => (
          <Skeleton
            key={i}
            className="rounded-none"
            style={{
              width: cell,
              height: cell,
              borderTopLeftRadius: i === 0 ? GRID_RADIUS : 0,
              borderTopRightRadius: i === columns - 1 ? GRID_RADIUS : 0,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  children,
}: {
  icon: typeof ImageOff;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-24">
      <Icon as={icon} size={40} className="text-muted-foreground" />
      <Text className="text-center text-base font-medium">{title}</Text>
      {hint ? <Text className="text-center text-[15px] text-muted-foreground">{hint}</Text> : null}
      {children}
    </Animated.View>
  );
}
