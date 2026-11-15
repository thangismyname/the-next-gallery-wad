import { useInfiniteQuery } from "@tanstack/react-query";
import { MOMENT_ASPECT, isMomentUnseen, MOMENT_MAX_PHOTOS, momentPeople, momentPictures, resolveMediaUrl } from "@tng/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Clock3, Plus } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { momentsFeedOptions } from "../momentsQuery";
import { useMomentsSeen } from "../useMomentsSeen";

const MAX = 12;
const TILE = 72;
const TILE_H = Math.round(TILE * MOMENT_ASPECT); // 3:4 portrait, same as the moment card

/**
 * Library header strip "Recent moments" (web `RecentMoments` in the Gallery): a
 * "+" tile (Camera in Moment mode), then the newest moments as 3:4 tiles — every
 * photo of the moment stacked like the card (≤ 3), the people's avatars (≤ 3)
 * on the corner, foreground ring = not seen yet — scrolling sideways. A
 * tile opens the Moments tab at that moment (`/moments?id=`). Hidden when there
 * are no moments.
 */
export function RecentMoments() {
  const { t } = useTranslation();
  const feed = useInfiniteQuery(momentsFeedOptions);
  const { baseline, ready } = useMomentsSeen();
  const moments = useMemo(() => (feed.data?.pages[0]?.items ?? []).slice(0, MAX), [feed.data]);

  if (feed.isPending) {
    return (
      <View className="gap-2.5 px-4 pb-4">
        <Skeleton className="h-4 w-36 rounded" />
        <View className="flex-row gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="rounded-2xl" style={{ width: TILE, height: TILE_H }} />
          ))}
        </View>
      </View>
    );
  }
  if (!moments.length) return null;

  return (
    <Animated.View entering={fadeIn} className="gap-2.5 pb-4">
      <View className="flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Clock3} size={16} className="text-muted-foreground" />
          <Text className="text-[15px] font-semibold">{t("moments.recent")}</Text>
        </View>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.navigate("/moments")}
          className="flex-row items-center gap-0.5 active:opacity-60"
        >
          <Text className="text-[13px] text-muted-foreground">{t("moments.seeAll")}</Text>
          <Icon as={ChevronRight} size={15} className="text-muted-foreground" />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("camera.momentsMode")}
          onPress={() => router.navigate({ pathname: "/camera", params: { mode: "moments" } })}
          className="items-center gap-1.5 active:opacity-70"
          style={{ width: TILE }}
        >
          <View
            className="items-center justify-center rounded-2xl border-2 border-dashed border-foreground/25 bg-foreground/5"
            style={{ width: TILE, height: TILE_H }}
          >
            <Icon as={Plus} size={24} className="text-foreground" />
          </View>
          <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
            {t("camera.momentsShort")}
          </Text>
        </Pressable>

        {moments.map((m) => {
          const unseen = ready && isMomentUnseen(m, baseline);
          const people = momentPeople(m).slice(0, MOMENT_MAX_PHOTOS);
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={t("moments.open", { name: m.userName })}
              onPress={() => router.navigate({ pathname: "/moments", params: { id: m.id } })}
              className="items-center gap-1.5 active:opacity-70"
              style={{ width: TILE }}
            >
              <View
                className={cn("rounded-2xl border-2 p-0.5", unseen ? "border-foreground" : "border-transparent")}
                style={{ width: TILE, height: TILE_H }}
              >
                <View className="flex-1 gap-px overflow-hidden rounded-[13px] bg-muted">
                  {momentPictures(m).map((uri, i) => (
                    <View key={i} className="flex-1 bg-muted">
                      {uri ? (
                        <Image source={{ uri: resolveMediaUrl(uri) }} contentFit="cover" recyclingKey={`${m.id}-${i}`} style={{ flex: 1 }} />
                      ) : null}
                    </View>
                  ))}
                </View>
                <View className="absolute -bottom-1.5 -right-1.5 flex-row-reverse">
                  {people.map((p, i) => (
                    <View key={p.userId} className="rounded-full border-2 border-background" style={{ marginRight: i ? -8 : 0 }}>
                      <PersonAvatar name={p.userName} image={p.userAvatarUrl} size={20} />
                    </View>
                  ))}
                </View>
              </View>
              <Text
                numberOfLines={1}
                className={cn("text-[11px]", unseen ? "font-semibold text-foreground" : "text-muted-foreground")}
              >
                {m.isOwn ? t("moments.you") : m.userName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}
