import { useQueryClient } from "@tanstack/react-query";
import {
  formatDate,
  formatDuration,
  storageQueryKey,
  trashQueryKey,
  type MediaListItem,
  type SwipeAction,
} from "@tng/shared";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, ChevronLeft, GalleryHorizontalEnd, Heart, Play, RotateCcw, Trash2, Undo2, X } from "lucide-react-native";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { galleryKeys } from "@/features/gallery/useGalleryMedia";
import { useTheme } from "@/hooks/useTheme";
import { APP_DURATION } from "@/lib/motion";

import { useSwipeReview } from "./useSwipeReview";

type Action = SwipeAction;
type CardHandle = { fly: (action: Action) => void };

const BAR = 44;
/** Header + caption + buttons around the card. */
const CHROME = 260;
const SWIPE_RATIO = 0.28;
const SWIPE_VELOCITY = 800;

/**
 * "Swipe to clean" (web `SwipeReviewView`, route `/review`, from Albums → Collections):
 * one photo at a time, newest first — swipe / ✕ left = move to Trash (soft delete),
 * swipe / ✓ right = keep, swipe up / ♥ = favorite and move on, Undo reverts the last decision.
 */
export function SwipeReviewScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { items, decisions, hasMore, loading, loadFailed, writeErrors, start, loadMore, decide, undo } =
    useSwipeReview();
  const card = useRef<CardHandle>(null);

  useEffect(() => {
    void start();
  }, [start]);

  // Leaving → refresh library, trash, storage, albums / labels / favorites.
  const changed = useRef(false);
  useEffect(() => {
    if (decisions.some((d) => d.action !== "keep")) changed.current = true;
  }, [decisions]);
  useEffect(
    () => () => {
      if (!changed.current) return;
      for (const queryKey of [galleryKeys.all, trashQueryKey, storageQueryKey, ["albums"], ["labels"], ["favorites"]])
        void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient],
  );

  const current = items[decisions.length];
  const next = items[decisions.length + 1];
  const trashed = decisions.filter((d) => d.action === "trash").length;
  const liked = decisions.filter((d) => d.action === "favorite").length;
  const waiting = !current && (loading || (hasMore && !loadFailed));

  const onDecide = (action: Action) => {
    void Haptics.selectionAsync();
    decide(action);
  };

  const cardWidth = Math.min(width - insets.left - insets.right - 32, (height - insets.top - insets.bottom - CHROME) * 0.75);
  const cardHeight = cardWidth / 0.75;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row items-center gap-3 px-4" style={{ paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}>
        <GlassButton size={BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
        <View className="flex-1">
          <Text className="font-heading text-2xl font-semibold">{t("review.title")}</Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("review.stats", { trashed, liked, kept: decisions.length - trashed - liked })}
          </Text>
        </View>
        <GlassButton size={BAR} accessibilityLabel={t("review.undo")} disabled={decisions.length === 0} onPress={undo}>
          <Icon as={Undo2} size={20} className={decisions.length === 0 ? "text-muted-foreground/40" : undefined} />
        </GlassButton>
      </View>

      <View className="flex-1 items-center justify-center">
        <View style={{ width: cardWidth, height: cardHeight }}>
          {next ? <CardFace item={next} style={{ transform: [{ scale: 0.95 }], opacity: 0.6 }} /> : null}
          {current ? (
            <SwipeCard key={current.id} ref={card} item={current} width={cardWidth} height={cardHeight} onDecide={onDecide} />
          ) : (
            <View className="absolute inset-0 items-center justify-center gap-3 rounded-3xl border border-dashed border-border px-6">
              {waiting ? (
                <ActivityIndicator color={colors.mutedForeground} />
              ) : loadFailed ? (
                <>
                  <Text className="text-center text-muted-foreground">{t("review.loadFailed")}</Text>
                  <Button variant="outline" onPress={() => void loadMore()}>
                    <Text>{t("common.retry")}</Text>
                  </Button>
                </>
              ) : items.length === 0 ? (
                <Text className="text-center text-muted-foreground">{t("review.empty")}</Text>
              ) : (
                <>
                  <Icon as={GalleryHorizontalEnd} size={36} className="text-muted-foreground/50" />
                  <Text className="text-center font-heading text-xl">{t("review.done")}</Text>
                  <Text className="text-center text-[14px] text-muted-foreground">{t("review.doneDesc")}</Text>
                  <View className="flex-row gap-2">
                    <Button variant="outline" onPress={() => void start()}>
                      <Icon as={RotateCcw} size={16} />
                      <Text>{t("review.restart")}</Text>
                    </Button>
                    <Button variant="outline" onPress={() => router.push("/trash")}>
                      <Icon as={Trash2} size={16} />
                      <Text>{t("review.openTrash")}</Text>
                    </Button>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
        <Text numberOfLines={1} className="mt-3 px-6 text-[13px] text-muted-foreground">
          {current
            ? `${formatDate(current.takenAt ?? current.createdAt, i18n.language)}${current.title ? ` · ${current.title}` : ""}`
            : " "}
        </Text>
      </View>

      <View className="flex-row items-center justify-center gap-6">
        <GlassButton
          size={64}
          accessibilityLabel={t("review.trash")}
          disabled={!current}
          onPress={() => card.current?.fly("trash")}
        >
          <Icon as={X} size={28} className="text-destructive" />
        </GlassButton>
        <GlassButton
          size={52}
          accessibilityLabel={t("review.favorite")}
          disabled={!current}
          onPress={() => card.current?.fly("favorite")}
        >
          <Icon as={Heart} size={22} className="text-rose-500" />
        </GlassButton>
        <GlassButton size={64} accessibilityLabel={t("review.keep")} disabled={!current} onPress={() => card.current?.fly("keep")}>
          <Icon as={Check} size={28} />
        </GlassButton>
      </View>
      <Text className="mt-3 text-center text-[13px] text-muted-foreground">
        {writeErrors > 0 ? t("review.writeFailed") : t("review.swipeHint")}
      </Text>
    </View>
  );
}

function CardFace({ item, style, children }: { item: MediaListItem; style?: object; children?: React.ReactNode }) {
  return (
    <View className="absolute inset-0 overflow-hidden rounded-3xl border border-border bg-muted" style={style}>
      <Image
        source={{ uri: item.displayUrl ?? item.thumbnailUrlLarge ?? item.thumbnailUrl }}
        placeholder={{ uri: item.thumbnailUrlLarge ?? item.thumbnailUrl }}
        recyclingKey={item.id}
        contentFit="contain"
        cachePolicy="memory-disk"
        style={{ width: "100%", height: "100%" }}
      />
      {item.mediaType === "video" ? (
        <View className="absolute bottom-3 left-3 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5">
          <Icon as={Play} size={12} className="text-white" fill="white" />
          <Text className="text-[12px] text-white">{formatDuration(item.durationSeconds)}</Text>
        </View>
      ) : null}
      {item.isFavorite ? (
        <View className="absolute bottom-3 right-3">
          <Icon as={Heart} size={20} className="text-rose-500" fill="currentColor" />
        </View>
      ) : null}
      {children}
    </View>
  );
}

function SwipeCard({
  item,
  width,
  height,
  onDecide,
  ref,
}: {
  item: MediaListItem;
  width: number;
  height: number;
  onDecide: (action: Action) => void;
  ref: Ref<CardHandle>;
}) {
  const { t } = useTranslation();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    scale.set(withTiming(1, { duration: APP_DURATION.fast }));
  }, [scale]);

  const fly = (action: Action) => {
    if (gone) return;
    setGone(true);
    const done = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(onDecide, action);
    };
    if (action === "favorite") y.set(withTiming(-height * 1.5, { duration: APP_DURATION.base }, done));
    else x.set(withTiming(action === "trash" ? -width * 1.5 : width * 1.5, { duration: APP_DURATION.base }, done));
  };
  useImperativeHandle(ref, () => ({ fly }));

  const pan = Gesture.Pan()
    .enabled(!gone)
    .minDistance(8)
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(Math.min(0, e.translationY));
    })
    .onEnd((e) => {
      const limit = width * SWIPE_RATIO;
      const up = -e.translationY > Math.abs(e.translationX);
      if (up && (-e.translationY > limit || e.velocityY < -SWIPE_VELOCITY)) scheduleOnRN(fly, "favorite");
      else if (up) {
        x.set(withSpring(0));
        y.set(withSpring(0));
      } else if (e.translationX < -limit || e.velocityX < -SWIPE_VELOCITY) scheduleOnRN(fly, "trash");
      else if (e.translationX > limit || e.velocityX > SWIPE_VELOCITY) scheduleOnRN(fly, "keep");
      else {
        x.set(withSpring(0));
        y.set(withSpring(0));
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${interpolate(x.get(), [-width, width], [-12, 12])}deg` },
      { scale: scale.get() },
    ],
  }));
  const trashStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-120, -30], [1, 0], "clamp") }));
  const keepStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [30, 120], [0, 1], "clamp") }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [-120, -30], [1, 0], "clamp") }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View className="absolute inset-0" style={cardStyle}>
        <CardFace item={item}>
          <Animated.View
            className="absolute right-5 top-5 rounded-lg border-2 border-destructive bg-background/80 px-3 py-1"
            style={trashStyle}
          >
            <Text className="text-[14px] font-bold uppercase text-destructive">{t("review.trash")}</Text>
          </Animated.View>
          <Animated.View
            className="absolute left-5 top-5 rounded-lg border-2 border-foreground bg-background/80 px-3 py-1"
            style={keepStyle}
          >
            <Text className="text-[14px] font-bold uppercase">{t("review.keep")}</Text>
          </Animated.View>
          <Animated.View
            className="absolute inset-x-0 bottom-10 items-center"
            style={likeStyle}
          >
            <View className="flex-row items-center gap-1.5 rounded-lg border-2 border-rose-500 bg-background/80 px-3 py-1">
              <Icon as={Heart} size={15} className="text-rose-500" fill="currentColor" />
              <Text className="text-[14px] font-bold uppercase text-rose-500">{t("review.favorite")}</Text>
            </View>
          </Animated.View>
        </CardFace>
      </Animated.View>
    </GestureDetector>
  );
}
