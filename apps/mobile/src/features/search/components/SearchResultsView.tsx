import { getInitials, resolveMediaUrl, type FriendSearchResult, type MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import { FolderOpen, Images, ScanSearch, Users, type LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { MediaTile, type TileNode } from "@/features/gallery/components/MediaTile";
import type { Rect } from "@/features/gallery/lightbox/geometry";
import { fadeIn } from "@/lib/motion";

import type { SearchResults } from "../useSearch";
import { SectionTitle } from "./SearchHome";

export type ResultList = "media" | "objects";
const GAP = 2;

/**
 * Results in the web Spotlight's order: photos (hybrid, % = match score) ·
 * objects (YOLO, % = confidence) · albums · friends. Photo grids open the
 * Lightbox over that list.
 */
export function SearchResultsView({
  results,
  width,
  onOpen,
  registerTile,
  onAlbum,
  onFriend,
}: {
  results: SearchResults;
  width: number;
  onOpen: (list: ResultList, item: MediaListItem, rect: Rect) => void;
  registerTile: (list: ResultList) => (id: string, node: TileNode | null) => void;
  onAlbum: (id: string) => void;
  onFriend: (friend: FriendSearchResult) => void;
}) {
  const { t } = useTranslation();
  const { media, objects, albums, friends } = results;
  if (!media.length && !objects.length && !albums.length && !friends.length) {
    return (
      <Animated.View entering={fadeIn}>
        <Text className="px-6 pt-16 text-center text-[15px] text-muted-foreground">{t("search.noResults")}</Text>
      </Animated.View>
    );
  }
  const columns = Math.max(3, Math.floor(width / 130));
  const cell = (width - GAP * (columns - 1)) / columns;

  return (
    <Animated.View entering={fadeIn} className="gap-7">
      {media.length ? (
        <ResultGrid
          icon={Images}
          title={t("search.mediaResults")}
          items={media}
          cell={cell}
          onPress={(item, rect) => onOpen("media", item, rect)}
          registerTile={registerTile("media")}
        />
      ) : null}
      {objects.length ? (
        <ResultGrid
          icon={ScanSearch}
          title={t("search.objectResults")}
          items={objects}
          cell={cell}
          onPress={(item, rect) => onOpen("objects", item, rect)}
          registerTile={registerTile("objects")}
        />
      ) : null}
      {albums.length ? (
        <View>
          <SectionTitle icon={FolderOpen} title={t("search.albumResults")} />
          {albums.map((album) => (
            <Row
              key={album.id}
              onPress={() => onAlbum(album.id)}
              leading={
                <View className="size-12 overflow-hidden rounded-xl bg-muted">
                  {album.coverUrl ? (
                    <Image source={{ uri: album.coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  ) : null}
                </View>
              }
              title={album.name}
              subtitle={`${album.mediaCount} ${t("search.photos")}`}
            />
          ))}
        </View>
      ) : null}
      {friends.length ? (
        <View>
          <SectionTitle icon={Users} title={t("search.friendResults")} />
          {friends.map((friend) => (
            <Row
              key={friend.id}
              onPress={() => onFriend(friend)}
              leading={
                <Avatar alt={friend.name} style={{ width: 48, height: 48 }}>
                  {friend.avatarUrl ? <AvatarImage source={{ uri: resolveMediaUrl(friend.avatarUrl) }} /> : null}
                  <AvatarFallback>
                    <Text className="font-semibold">{getInitials(friend.name)}</Text>
                  </AvatarFallback>
                </Avatar>
              }
              title={friend.name}
              subtitle={friend.email}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

const ResultGrid = memo(function ResultGrid({
  icon,
  title,
  items,
  cell,
  onPress,
  registerTile,
}: {
  icon: LucideIcon;
  title: string;
  items: MediaListItem[];
  cell: number;
  onPress: (item: MediaListItem, rect: Rect) => void;
  registerTile: (id: string, node: TileNode | null) => void;
}) {
  return (
    <View>
      <SectionTitle icon={icon} title={`${title} · ${items.length}`} />
      <View className="flex-row flex-wrap" style={{ gap: GAP }}>
        {items.map((item) => (
          <View key={item.id}>
            <MediaTile item={item} size={cell} onPress={onPress} registerTile={registerTile} />
            {item.score != null ? (
              // Badge on the photo → dark-on-image like the web thumbnails.
              <View pointerEvents="none" className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5">
                <Text className="text-[11px] font-medium text-white">{Math.round(item.score * 100)}%</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
});

function Row({
  leading,
  title,
  subtitle,
  onPress,
}: {
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-2 active:bg-foreground/5">
      {leading}
      <View className="flex-1">
        <Text numberOfLines={1} className="text-base font-medium">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-[14px] text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
