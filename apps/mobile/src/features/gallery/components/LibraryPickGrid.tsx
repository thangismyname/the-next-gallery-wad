import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { albumsQueryKey, autoAlbumsQueryKey, pickAlbums, type MediaListItem } from "@tng/shared";
import { FolderOpen, Heart, Tag } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MediaTile } from "@/features/gallery/components/MediaTile";
import { GRID_GAP, chunkRows, gridCell, gridColumns } from "@/features/gallery/gridLayout";
import { pickSourceKey, usePickSourceMedia, type PickSource } from "@/features/gallery/usePickSourceMedia";
import { useGalleryMedia } from "@/features/gallery/useGalleryMedia";
import { useLabels } from "@/features/favorites/useLabels";
import { albumsApi } from "@/services";
import { useTheme } from "@/hooks/useTheme";

/**
 * The user's library (server) newest first — tap = (un)select (the caller decides one vs many).
 * Used by the avatar picker (photos only) and the moment pickers (+ videos, `browse`): search
 * (hybrid, inside the chosen source) + chips All · Favorites · labels · albums (regular + auto),
 * like the web picker.
 */
export function LibraryPickGrid({
  selectedIds,
  onSelect,
  bottomInset,
  hint,
  includeVideos = false,
  browse = false,
}: {
  selectedIds: string[];
  onSelect: (item: MediaListItem) => void;
  bottomInset: number;
  hint: string;
  includeVideos?: boolean;
  /** Ô tìm + hàng chip Tất cả · Yêu thích · nhãn · album (thường + tự động). */
  browse?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // Nguồn ảnh (giống web picker): cả thư viện · Yêu thích · nhãn · album thường + tự động.
  const [source, setSource] = useState<PickSource>({ kind: "all" });
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 350);
    return () => clearTimeout(timer);
  }, [text]);
  const { labels } = useLabels(browse);
  const regular = useQuery({ queryKey: albumsQueryKey, queryFn: albumsApi.fetchAlbums, enabled: browse, staleTime: 60_000 });
  const auto = useQuery({ queryKey: autoAlbumsQueryKey, queryFn: albumsApi.fetchAutoAlbums, enabled: browse, staleTime: 5 * 60_000 });
  const sources = useMemo<{ source: PickSource; label: string; icon?: typeof Heart }[]>(
    () => [
      { source: { kind: "all" }, label: t("mediaPicker.filter.all") },
      { source: { kind: "favorites" }, label: t("favorites.title"), icon: Heart },
      ...labels.map((l) => ({ source: { kind: "label", id: l.id, name: l.name } as PickSource, label: `${l.name} · ${l.count}`, icon: Tag })),
      ...pickAlbums(regular.data, auto.data, t, i18n.language).map((album) => ({
        source: { kind: "album", album } as PickSource,
        label: `${album.name} · ${album.count}`,
        icon: FolderOpen,
      })),
    ],
    [labels, regular.data, auto.data, t, i18n.language],
  );
  const library = useGalleryMedia("newest");
  const picked = usePickSourceMedia(source, browse ? query : "");
  const { items, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = browse ? picked : library;
  const photos = useMemo(() => (includeVideos ? items : items.filter((m) => m.mediaType !== "video")), [items, includeVideos]);
  const columns = gridColumns(width);
  const cell = gridCell(width, columns);
  const rows = useMemo(() => chunkRows(photos, columns), [photos, columns]);
  const press = useCallback((item: MediaListItem) => onSelect(item), [onSelect]);

  return (
    <FlashList
      data={rows}
      extraData={selectedIds}
      keyExtractor={(row) => row[0].id}
      onEndReached={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
      onEndReachedThreshold={1.5}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      ListHeaderComponent={
        <View className="gap-3 pb-3">
          <Text className="px-4 text-[14px] text-muted-foreground">{hint}</Text>
          {browse ? (
            <>
              <View className="px-4">
                <FilterField value={text} onChangeText={setText} placeholder={t("mediaPicker.searchMobile")} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
                {sources.map(({ source: s, label, icon }) => (
                  <SourceChip
                    key={pickSourceKey(s)}
                    label={label}
                    icon={icon}
                    active={pickSourceKey(s) === pickSourceKey(source)}
                    onPress={() => setSource(s)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      }
      renderItem={({ item: row }) => (
        <View className="flex-row" style={{ gap: GRID_GAP, marginBottom: GRID_GAP }}>
          {row.map((m) => (
            <MediaTile key={m.id} item={m} size={cell} onPress={press} selected={selectedIds.includes(m.id)} />
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

function SourceChip({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: typeof Heart;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? "border-foreground bg-foreground" : "border-border"}`}
    >
      {icon ? <Icon as={icon} size={14} className={active ? "text-background" : "text-muted-foreground"} /> : null}
      <Text numberOfLines={1} className={`max-w-40 text-[13px] ${active ? "text-background" : "text-muted-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
