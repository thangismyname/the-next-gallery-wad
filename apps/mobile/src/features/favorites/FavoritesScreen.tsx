import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Portal } from "@rn-primitives/portal";
import { useSelectionStore, type MediaListItem, type SavedFilter, type SavedMediaItem } from "@tng/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Bookmark, CheckCircle2, ChevronLeft, Heart } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, RefreshControl, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MediaTile } from "@/features/gallery/components/MediaTile";
import { SelectionBar } from "@/features/gallery/components/SelectionBar";
import { SelectionHeader } from "@/features/gallery/components/SelectionHeader";
import { GRID_GAP, chunkRows, gridCell, gridColumns } from "@/features/gallery/gridLayout";
import type { Rect } from "@/features/gallery/lightbox/geometry";
import { Lightbox } from "@/features/gallery/lightbox/Lightbox";
import { useDragSelect, type DragSelectScroller } from "@/features/gallery/useDragSelect";
import { useTileViewer } from "@/features/gallery/useTileViewer";
import { BOTTOM_BAR_HEIGHT, HEADER_ROW, bottomBarOffset } from "@/features/navigation/layout";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";

import { FilterChips } from "./components/FilterChips";
import { LABEL_DOT } from "./labelColors";
import { useLabels } from "./useLabels";
import { useSaved } from "./useSaved";

const BAR = 44;

/**
 * Favorites (web `FavoritesView`, pushed from the Albums tab; `?filter=` opens a
 * label directly): photos that are hearted OR carry a personal label. Filter
 * chips · grid with heart + label dots on each tile · Lightbox · selection
 * (hold / sideways drag, same bar as the Library). A deleted label falls back to
 * "All".
 */
export function FavoritesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { labels, totals, isPending: labelsPending } = useLabels();

  const [requested, setRequested] = useState<SavedFilter>(params.filter ?? "all");
  const filter: SavedFilter =
    labelsPending || requested === "all" || requested === "favorites" || labels.some((l) => l.id === requested)
      ? requested
      : "all";
  const activeLabel = labels.find((l) => l.id === filter);

  const { data, isPending, isError, refetch, isRefetching } = useSaved(filter);
  const items: SavedMediaItem[] = useMemo(() => data?.items ?? [], [data]);

  const listWidth = width - insets.left - insets.right;
  const columns = gridColumns(listWidth);
  const cell = gridCell(listWidth, columns);
  const rows = useMemo(() => chunkRows(items, columns), [items, columns]);
  const dotsById = useMemo(() => {
    const colorOf = new Map(labels.map((l) => [l.id, LABEL_DOT[l.color] ?? LABEL_DOT.slate]));
    return new Map(items.map((m) => [m.id, m.labelIds.map((id) => colorOf.get(id)).filter(Boolean) as string[]]));
  }, [items, labels]);

  // ── Selection ────────────────────────────────────────────────────────────
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clearSelection = useSelectionStore((s) => s.clear);
  const setSelecting = useSelectionStore((s) => s.setSelecting);
  const toggleSelected = useSelectionStore((s) => s.toggle);
  useFocusEffect(useCallback(() => () => clearSelection(), [clearSelection]));
  useEffect(() => {
    if (!isSelecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [isSelecting, clearSelection]);
  const changeFilter = (next: SavedFilter) => {
    clearSelection();
    setRequested(next);
  };

  // ── Tiles, drag-select, Lightbox ─────────────────────────────────────────
  const listRef = useRef<FlashListRef<SavedMediaItem[]>>(null);
  const { tiles, registerTile, viewer, setViewer, revealTile, getTileRect } = useTileViewer({
    items,
    columns,
    listRef,
    topInset: insets.top + BAR,
  });
  const offset = useRef(0);
  const contentHeight = useRef(0);
  const scroller: DragSelectScroller = {
    getOffset: () => offset.current,
    getMaxOffset: () => contentHeight.current - height,
    scrollTo: (y) => listRef.current?.scrollToOffset({ offset: y, animated: false }),
    edges: { top: insets.top + HEADER_ROW, bottom: height - bottomBarOffset(insets.bottom) - BOTTOM_BAR_HEIGHT },
  };
  const { gesture, dragging, swallowTap } = useDragSelect({ items, tiles, scroller });

  const openTile = useCallback(
    (item: MediaListItem, rect: Rect) => {
      if (swallowTap()) return;
      if (useSelectionStore.getState().isSelecting) toggleSelected(item.id);
      else setViewer({ id: item.id, rect });
    },
    [swallowTap, toggleSelected, setViewer],
  );

  const emptyText =
    filter === "all"
      ? t("favorites.empty")
      : filter === "favorites"
        ? t("favorites.emptyHearts")
        : t("favorites.emptyLabel", { name: activeLabel?.name ?? "" });
  const top = insets.top + 8 + BAR + 8;

  return (
    <View className="flex-1 bg-background">
      <GestureDetector gesture={gesture}>
        <View className="flex-1" collapsable={false}>
          <FlashList
            ref={listRef}
            data={rows}
            extraData={isSelecting ? selectedIds : dotsById}
            keyExtractor={(row) => row[0].id}
            scrollEnabled={!dragging}
            onScroll={(e) => {
              offset.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onContentSizeChange={(_, h) => {
              contentHeight.current = h;
            }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} progressViewOffset={top} />
            }
            contentContainerStyle={{
              paddingTop: top,
              paddingBottom: insets.bottom + BOTTOM_BAR_HEIGHT + 32,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            }}
            ListHeaderComponent={
              <View className="gap-4 pb-4">
                <View className="flex-row items-center gap-3 px-4">
                  <View className="size-11 items-center justify-center rounded-2xl bg-rose-500/10">
                    <Icon as={Heart} size={22} className="text-rose-500" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-heading text-3xl font-semibold">{t("favorites.title")}</Text>
                    <Text className="text-[14px] text-muted-foreground">
                      {t("favorites.subtitle", { count: String(totals.all) })}
                    </Text>
                  </View>
                </View>
                <FilterChips
                  filter={filter}
                  onChange={changeFilter}
                  labels={labels}
                  totals={totals}
                  onManage={() => router.push("/labels")}
                />
              </View>
            }
            renderItem={({ item: row }) => (
              <View className="flex-row" style={{ gap: GRID_GAP, marginBottom: GRID_GAP }}>
                {row.map((media) => (
                  <MediaTile
                    key={media.id}
                    item={media}
                    size={cell}
                    onPress={openTile}
                    registerTile={registerTile}
                    dots={dotsById.get(media.id)}
                    selected={isSelecting ? selectedIds.has(media.id) : undefined}
                  />
                ))}
              </View>
            )}
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
                  <Button variant="outline" onPress={() => void refetch()}>
                    <Text>{t("common.retry")}</Text>
                  </Button>
                </View>
              ) : (
                <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-16">
                  <Icon as={activeLabel ? Bookmark : Heart} size={40} className="text-muted-foreground/50" />
                  <Text className="text-center text-[15px] text-muted-foreground">{emptyText}</Text>
                </Animated.View>
              )
            }
          />
        </View>
      </GestureDetector>

      {isSelecting ? (
        <>
          <SelectionHeader allIds={items.map((m) => m.id)} />
          <SelectionBar items={items} />
        </>
      ) : (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 flex-row items-center justify-between"
          style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
        >
          <GlassButton size={BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
            <Icon as={ChevronLeft} size={24} />
          </GlassButton>
          <View className="flex-row items-center gap-2.5">
            {isRefetching && !isPending ? <ActivityIndicator color={colors.mutedForeground} /> : null}
            {items.length ? (
              <GlassButton size={BAR} accessibilityLabel={t("gallery.selection.select")} onPress={() => setSelecting(true)}>
                <Icon as={CheckCircle2} size={21} />
              </GlassButton>
            ) : null}
          </View>
        </View>
      )}

      {viewer && items.length ? (
        <Portal name="favorites-lightbox">
          <Lightbox
            items={items}
            startId={viewer.id}
            originRect={viewer.rect}
            getTileRect={getTileRect}
            onEndReached={noop}
            onIndexChange={(id) => void revealTile(id)}
            onClose={() => setViewer(null)}
          />
        </Portal>
      ) : null}
    </View>
  );
}

const noop = () => {};
