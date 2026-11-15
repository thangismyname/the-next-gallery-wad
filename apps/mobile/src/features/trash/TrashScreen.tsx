import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Portal } from "@rn-primitives/portal";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { formatBytes, storageQueryKey, trashQueryKey, useSelectionStore, type MediaListItem, type TrashItem } from "@tng/shared";
import { router, useFocusEffect } from "expo-router";
import { CheckCircle2, ChevronLeft, Ellipsis, RotateCcw, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { GlassMenu, type GlassMenuItem } from "@/components/shared/GlassMenu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MediaTile } from "@/features/gallery/components/MediaTile";
import { SelectionHeader } from "@/features/gallery/components/SelectionHeader";
import { GRID_GAP, chunkRows, gridCell, gridColumns } from "@/features/gallery/gridLayout";
import type { Rect } from "@/features/gallery/lightbox/geometry";
import { Lightbox, type LightboxAction } from "@/features/gallery/lightbox/Lightbox";
import { galleryKeys } from "@/features/gallery/useGalleryMedia";
import { useDragSelect, type DragSelectScroller } from "@/features/gallery/useDragSelect";
import { useTileViewer } from "@/features/gallery/useTileViewer";
import { BOTTOM_BAR_HEIGHT, HEADER_ROW, bottomBarOffset } from "@/features/navigation/layout";
import { useStorage } from "@/features/profile/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";
import { mediaApi } from "@/services";

import { TrashSelectionBar } from "./components/TrashSelectionBar";

const PAGE_SIZE = 100;
const BAR = 44;
const noEdit = () => false;

/** Every id in the trash (not only the loaded pages) — for "Restore all". */
async function allTrashIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; ) {
    const page = await mediaApi.fetchTrash(offset, PAGE_SIZE);
    ids.push(...page.items.map((m) => m.id));
    if (!page.hasMore || !page.items.length) return ids;
    offset += page.items.length;
  }
}

/**
 * Trash (web `TrashView`, route `/trash`, from Albums → Collections and the
 * account sheet → Storage):
 * header with count + size · grid · selection like Favorites (Select button,
 * hold a tile, sideways drag) with its own bar Restore · Delete forever ·
 * Lightbox with Restore / Delete forever (no heart / trash / albums — `canEdit`
 * false) · ⋯ Restore all / Empty trash. Deleting forever is always confirmed.
 */
export function TrashScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const storage = useStorage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const query = useInfiniteQuery({
    queryKey: trashQueryKey,
    queryFn: ({ pageParam }) => mediaApi.fetchTrash(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
  });
  const items: TrashItem[] = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  // The trash API has no total → count from `/profile/storage` (refreshed with the trash).
  const total = Math.max(storage.data?.trashCount ?? 0, items.length);

  /** Trash, library and storage all change after restore / delete. */
  const refresh = useCallback(
    () =>
      Promise.all(
        [trashQueryKey, galleryKeys.all, storageQueryKey, ["favorites"], ["ai", "tags"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    [queryClient],
  );

  // ── Selection (shared store, cleared when leaving the screen) ────────────
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

  // ── Grid, drag-select, Lightbox ──────────────────────────────────────────
  const listWidth = width - insets.left - insets.right;
  const columns = gridColumns(listWidth);
  const cell = gridCell(listWidth, columns);
  const rows = useMemo(() => chunkRows(items, columns), [items, columns]);

  const listRef = useRef<FlashListRef<TrashItem[]>>(null);
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
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const confirmForever = (message: string, run: () => Promise<unknown>) =>
    new Promise<void>((resolve, reject) =>
      Alert.alert(t("trash.deleteForeverTitle"), message, [
        { text: t("common.cancel"), style: "cancel", onPress: () => resolve() },
        { text: t("trash.deleteForever"), style: "destructive", onPress: () => run().then(() => resolve(), reject) },
      ]),
    );

  const lightboxActions: LightboxAction[] = [
    {
      key: "restore",
      label: t("trash.restore"),
      icon: RotateCcw,
      onPress: (item) => mediaApi.restoreMedia([item.id]).then(refresh),
    },
    {
      key: "forever",
      label: t("trash.deleteForever"),
      icon: Trash2,
      destructive: true,
      onPress: (item) => confirmForever(t("trash.deleteForeverDesc"), () => mediaApi.permanentDeleteMedia([item.id]).then(refresh)),
    },
  ];

  const bulk = (kind: "restore" | "empty") => {
    setMenuOpen(false);
    const run = async () => {
      setBusy(true);
      try {
        if (kind === "restore") await mediaApi.restoreMedia(await allTrashIds());
        else await mediaApi.emptyTrash();
        clearSelection();
        await refresh();
      } catch {
        Alert.alert(t("lightbox.actionFailed"));
      } finally {
        setBusy(false);
      }
    };
    if (kind === "restore") return void run();
    Alert.alert(t("trash.deleteForeverTitle"), t("trash.deleteForeverAllDesc", { count: total }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("trash.emptyTrash"), style: "destructive", onPress: () => void run() },
    ]);
  };
  const menuItems: GlassMenuItem[] = [
    { key: "restore", label: t("trash.restoreAll"), icon: RotateCcw, onPress: () => bulk("restore") },
    { key: "empty", label: t("trash.emptyTrash"), icon: Trash2, destructive: true, onPress: () => bulk("empty") },
  ];

  const subtitle = storage.data?.trashCount
    ? `${t("trash.subtitle", { count: total })} · ${formatBytes(storage.data.trashBytes)}`
    : t("trash.subtitle", { count: total });
  const top = insets.top + 8 + BAR + 8;
  const refreshing = (query.isRefetching && !query.isFetchingNextPage) || busy;

  return (
    <View className="flex-1 bg-background">
      <GestureDetector gesture={gesture}>
        <View className="flex-1" collapsable={false}>
          <FlashList
            ref={listRef}
            data={rows}
            extraData={isSelecting ? selectedIds : null}
            keyExtractor={(row) => row[0].id}
            scrollEnabled={!dragging}
            onScroll={(e) => {
              offset.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onContentSizeChange={(_, h) => {
              contentHeight.current = h;
            }}
            onEndReached={loadMore}
            onEndReachedThreshold={1.5}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void query.refetch()} progressViewOffset={top} />}
            contentContainerStyle={{
              paddingTop: top,
              paddingBottom: insets.bottom + BOTTOM_BAR_HEIGHT + 32,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            }}
            ListHeaderComponent={
              <View className="gap-3 px-4 pb-4">
                <View className="flex-row items-center gap-3">
                  <View className="size-11 items-center justify-center rounded-2xl bg-destructive/10">
                    <Icon as={Trash2} size={22} className="text-destructive" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-heading text-3xl font-semibold">{t("trash.title")}</Text>
                    <Text className="text-[14px] text-muted-foreground">{subtitle}</Text>
                  </View>
                </View>
                {items.length ? <Text className="text-[13px] text-muted-foreground">{t("trash.hint")}</Text> : null}
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
                    selected={isSelecting ? selectedIds.has(media.id) : undefined}
                  />
                ))}
              </View>
            )}
            ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-6" color={colors.mutedForeground} /> : null}
            ListEmptyComponent={
              query.isPending ? (
                <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
                  {Array.from({ length: columns * 4 }, (_, i) => (
                    <Skeleton key={i} className="rounded-none" style={{ width: cell, height: cell }} />
                  ))}
                </View>
              ) : query.isError ? (
                <View className="items-center gap-3 px-8 pt-16">
                  <Text className="text-center text-base">{t("gallery.error.loadFailed")}</Text>
                  <Button variant="outline" onPress={() => void query.refetch()}>
                    <Text>{t("common.retry")}</Text>
                  </Button>
                </View>
              ) : (
                <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-12">
                  <Icon as={Trash2} size={40} className="text-muted-foreground/50" />
                  <Text className="text-center text-[15px] text-muted-foreground">{t("trash.empty")}</Text>
                </Animated.View>
              )
            }
          />
        </View>
      </GestureDetector>

      {isSelecting ? (
        <>
          <SelectionHeader allIds={items.map((m) => m.id)} />
          <TrashSelectionBar onDone={refresh} />
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
          <View pointerEvents="box-none" className="flex-row items-center gap-2.5">
            {refreshing && !query.isPending ? <ActivityIndicator color={colors.mutedForeground} /> : null}
            {items.length ? (
              <>
                <GlassButton size={BAR} accessibilityLabel={t("gallery.selection.select")} onPress={() => setSelecting(true)}>
                  <Icon as={CheckCircle2} size={21} />
                </GlassButton>
                <GlassButton
                  size={BAR}
                  accessibilityLabel={t("albums.more")}
                  accessibilityState={{ expanded: menuOpen }}
                  disabled={busy}
                  onPress={() => setMenuOpen((v) => !v)}
                >
                  <Icon as={Ellipsis} size={22} />
                </GlassButton>
              </>
            ) : null}
          </View>
        </View>
      )}

      {menuOpen && !isSelecting ? (
        <>
          <Pressable accessibilityLabel={t("common.cancel")} onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
          <View pointerEvents="box-none" className="absolute" style={{ top: insets.top + 8 + BAR + 8, right: insets.right + 16 }}>
            <GlassMenu items={menuItems} width={250} />
          </View>
        </>
      ) : null}

      {viewer && items.length ? (
        <Portal name="trash-lightbox">
          <Lightbox
            items={items}
            startId={viewer.id}
            originRect={viewer.rect}
            getTileRect={getTileRect}
            onEndReached={loadMore}
            onIndexChange={(id) => void revealTile(id)}
            onClose={() => setViewer(null)}
            actions={lightboxActions}
            canEdit={noEdit}
          />
        </Portal>
      ) : null}
    </View>
  );
}
