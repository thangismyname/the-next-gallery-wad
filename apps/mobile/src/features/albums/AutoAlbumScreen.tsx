import { useMutation, useQueryClient } from "@tanstack/react-query";
import { albumsQueryKey, autoAlbumName } from "@tng/shared";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { FolderPlus, Images, Sparkles } from "lucide-react-native";
import { ActivityIndicator, Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { MediaGridScreen } from "@/features/gallery/components/MediaGridScreen";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";
import { albumsApi } from "@/services";

import { useAutoAlbumMedia, useAutoAlbums } from "./useAlbums";

/**
 * One auto album (web `AutoAlbumView`, route `/albums/auto/<key>`): read-only,
 * recomputed by the API; "Save as album" → a manual album with the same photos
 * (opens it). Name + cover come from the cached auto-album list.
 */
export function AutoAlbumScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { key = "" } = useLocalSearchParams<{ key: string }>();
  const groups = useAutoAlbums();
  const album = groups.data?.flatMap((g) => g.albums).find((a) => a.key === key);
  const name = album ? autoAlbumName(album, t, i18n.language) : "";
  const media = useAutoAlbumMedia(key);

  const save = useMutation({
    mutationFn: () => albumsApi.saveAutoAlbum(key, name || key),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      router.replace({ pathname: "/albums/[id]", params: { id: created.id } });
    },
    onError: () => Alert.alert(t("albums.saveFailed")),
  });

  return (
    <MediaGridScreen
      portal="auto-album-lightbox"
      backLabel={t("albums.title")}
      items={media.items}
      isPending={media.isPending || groups.isPending}
      isError={media.isError}
      refreshing={media.isRefetching && !media.isFetchingNextPage}
      onRefresh={() => void media.refetch()}
      hasNextPage={media.hasNextPage}
      loadingMore={media.isFetchingNextPage}
      onLoadMore={() => void media.fetchNextPage()}
      header={
        <View className="gap-4 px-4">
          <View className="flex-row gap-4">
            <View className="size-24 items-center justify-center overflow-hidden rounded-3xl bg-muted">
              {album?.coverUrl ? (
                <Image source={{ uri: album.coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Icon as={Images} size={30} className="text-muted-foreground/50" />
              )}
            </View>
            <View className="flex-1 justify-center gap-1">
              {album ? (
                <View className="flex-row items-center gap-1 self-start rounded-full bg-muted px-2 py-0.5">
                  <Icon as={Sparkles} size={12} />
                  <Text className="text-[11px] font-semibold">{t(`albums.auto.groups.${album.group}`)}</Text>
                </View>
              ) : null}
              <Text numberOfLines={2} className="font-heading text-[28px] font-semibold leading-tight">
                {name}
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                {t("albums.photoCount", { n: media.total || album?.count || 0 })} · {t("albums.auto.readOnly")}
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={!album || save.isPending}
            onPress={() => save.mutate()}
          >
            {save.isPending ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Icon as={FolderPlus} size={18} />
            )}
            <Text>{t("albums.auto.save")}</Text>
          </Button>
        </View>
      }
      empty={
        <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-12">
          <Icon as={Images} size={40} className="text-muted-foreground/50" />
          <Text className="text-center text-[15px] text-muted-foreground">{t("albums.notFound")}</Text>
        </Animated.View>
      }
    />
  );
}
