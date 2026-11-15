import { useMutation, useQueryClient } from "@tanstack/react-query";
import { albumsQueryKey, type MediaListItem } from "@tng/shared";
import { router, useLocalSearchParams } from "expo-router";
import { FolderPlus, Tag } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { MediaGridScreen } from "@/features/gallery/components/MediaGridScreen";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { albumsApi } from "@/services";

import { ConfidenceSlider } from "./components/ConfidenceSlider";
import { useTagCatalog } from "./useTagCatalog";
import { useTagMedia, useTagSummary } from "./useTagData";

/**
 * Photos of one category / detailed label (web `TagMediaGrid`, route
 * `/studio/<tag>`): most confident first with a % badge, confidence slider
 * (null = the tag's auto threshold), "Create smart album" with that rule (→ opens
 * it), Lightbox.
 */
export function TagMediaScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { tag = "" } = useLocalSearchParams<{ tag: string }>();
  const { describe } = useTagCatalog();
  const display = describe(tag);
  const name = display?.name ?? tag;

  const [threshold, setThreshold] = useState<number | null>(null);
  const summary = useTagSummary();
  const autoThreshold = summary.byTag.get(tag)?.threshold ?? display?.label?.threshold ?? 0.5;
  const media = useTagMedia(tag, threshold);

  const createAlbum = useMutation({
    mutationFn: () => albumsApi.createAlbum({ name, smartRule: { type: "tags", tags: [tag], minConfidence: threshold } }),
    onSuccess: (album) => {
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      router.push({ pathname: "/albums/[id]", params: { id: album.id } });
    },
    onError: () => Alert.alert(t("studio.albumFailed")),
  });
  // Heart / trash in the Lightbox → counts + this list may have changed.
  const onViewerClose = useCallback(() => void queryClient.invalidateQueries({ queryKey: ["ai", "tags"] }), [queryClient]);
  const badge = useCallback((item: MediaListItem) => <ConfidenceBadge value={item.score ?? 0} />, []);
  const TagIcon = display?.icon ?? Tag;

  return (
    <MediaGridScreen
      portal="studio-lightbox"
      backLabel={t("studio.back")}
      items={media.items}
      isPending={media.isPending}
      isError={media.isError}
      refreshing={media.isRefetching && !media.isFetchingNextPage}
      onRefresh={() => void media.refetch()}
      hasNextPage={media.hasNextPage}
      loadingMore={media.isFetchingNextPage}
      onLoadMore={() => void media.fetchNextPage()}
      badge={badge}
      onViewerClose={onViewerClose}
      header={
        <View className="gap-5">
          <View className="flex-row items-center gap-3 px-4">
            <View className="size-11 items-center justify-center rounded-2xl bg-muted">
              <Icon as={TagIcon} size={22} className="text-foreground" />
            </View>
            <View className="flex-1">
              <Text numberOfLines={2} className="font-heading text-3xl font-semibold">
                {name}
              </Text>
              <Text className="text-[14px] text-muted-foreground">{t("studio.photoCount", { n: media.total })}</Text>
            </View>
          </View>
          <View className="mx-4 gap-4 rounded-3xl bg-muted/50 p-4">
            <ConfidenceSlider value={threshold} autoValue={autoThreshold} onChange={setThreshold} />
            <Button
              variant="outline"
              className="rounded-full"
              disabled={media.total === 0 || createAlbum.isPending}
              onPress={() => createAlbum.mutate()}
            >
              {createAlbum.isPending ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Icon as={FolderPlus} size={18} />
              )}
              <Text>{t("studio.createAlbum")}</Text>
            </Button>
          </View>
        </View>
      }
      empty={
        <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-12">
          <Icon as={TagIcon} size={40} className="text-muted-foreground/50" />
          <Text className="text-center text-[15px] text-muted-foreground">{t("studio.emptyTag")}</Text>
        </Animated.View>
      }
    />
  );
}

/** Confidence of the tag on the photo — on the photo → dark-on-image; emerald when very sure (≥ 80 %), like the web. */
function ConfidenceBadge({ value }: { value: number }) {
  return (
    <View
      pointerEvents="none"
      className={cn("absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5", value >= 0.8 ? "bg-emerald-600/85" : "bg-black/60")}
    >
      <Text className="text-[11px] font-semibold text-white">{Math.round(value * 100)}%</Text>
    </View>
  );
}
