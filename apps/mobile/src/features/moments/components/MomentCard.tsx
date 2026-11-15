import { MOMENT_ASPECT, formatRelative, momentPeople, type Moment } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { Ellipsis, Heart, Sticker } from "lucide-react-native";
import { memo, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { APP_DURATION, EASE_OUT, PRESS_TIMING, fadeIn, fadeOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { MemeBack } from "./MemeBack";
import { MomentMedia } from "./MomentMedia";
import { PersonAvatar } from "@/components/shared/PersonAvatar";

/** Reactions in the long-press picker (same set as the web `momentCard.ts`). */
export const QUICK_EMOJIS = ["😡", "😢", "😮", "😂", "❤️"];
/** Height of everything on a card except the picture (pager sizing). */
export const CARD_CHROME = 118;
const FLIP = { duration: 420, easing: EASE_OUT };

type Props = {
  moment: Moment;
  size: number;
  /** Card in view → its video plays. */
  active: boolean;
  /** A friend's moment newer than the "seen" mark. */
  unseen?: boolean;
  onReact: (moment: Moment, emoji: string) => void;
  onRemove: (moment: Moment) => Promise<void>;
  /** The card turned to its meme side (the pager stops paging so the list can scroll). */
  onFlipChange?: (momentId: string, flipped: boolean) => void;
};

/**
 * One moment (same layout as the web `MomentCard`): who · when · "New" · ⋯ above;
 * the square picture carries only the caption. **Tap = flip** to the memes on
 * the back, double-tap = ❤️. Below: one reaction button (tap = ❤️ / remove mine,
 * hold = pick another emoji), who reacted, and the Meme button (also flips).
 */
export const MomentCard = memo(function MomentCard({ moment, size, active, unseen, onReact, onRemove, onFlipChange }: Props) {
  const { t, i18n } = useTranslation();
  const people = momentPeople(moment);
  const others = people.length - 1;
  const author = moment.isOwn ? t("moments.you") : moment.userName;
  const canRemove = moment.isOwn || moment.isParticipant;
  const [burst, setBurst] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // The back (meme list + its query) mounts on the first flip only.
  const [everFlipped, setEverFlipped] = useState(false);
  const [picker, setPicker] = useState(false);

  // Card angle: each turn adds another half-turn to the left (so turning back
  // keeps the same direction instead of spinning backwards). `side` = the angle
  // it rests at (a multiple of 180); odd multiples = the meme side.
  const rotation = useSharedValue(0);
  const side = useSharedValue(0);
  useEffect(() => {
    onFlipChange?.(moment.id, flipped);
  }, [flipped, moment.id, onFlipChange]);
  const frontStyle = useAnimatedStyle(() => {
    const n = ((rotation.get() % 360) + 360) % 360;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotation.get()}deg` }],
      opacity: n < 90 || n > 270 ? 1 : 0,
    };
  });
  const backStyle = useAnimatedStyle(() => {
    const n = ((rotation.get() % 360) + 360) % 360;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotation.get() - 180}deg` }],
      opacity: n >= 90 && n <= 270 ? 1 : 0,
    };
  });

  /** Rest at `target` (a multiple of 180) and sync React state with the face shown. */
  const settle = (target: number) => {
    const back = Math.abs(Math.round(target / 180)) % 2 === 1;
    if (back) setEverFlipped(true);
    setPicker(false);
    setFlipped(back);
    void Haptics.selectionAsync();
  };
  /** Tap / Meme button / ↺: one more half-turn to the left. */
  const turn = (to?: "front") => {
    const cur = side.get();
    const back = Math.abs(Math.round(cur / 180)) % 2 === 1;
    if (to === "front" && !back) return;
    const target = cur - 180;
    side.set(target);
    rotation.set(withTiming(target, FLIP));
    settle(target);
  };
  const flip = () => turn();
  const heart = () => {
    if (moment.myReaction !== "❤️") onReact(moment, "❤️");
    setBurst((n) => n + 1);
  };
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => scheduleOnRN(heart));
  const singleTap = Gesture.Tap().onEnd(() => scheduleOnRN(flip));
  const pictureGesture = Gesture.Exclusive(doubleTap, singleTap);

  const confirmRemove = () => {
    const own = moment.isOwn;
    Alert.alert(t(own ? "moments.deleteConfirm" : "moments.leave"), t(own ? "moments.deleteConfirmDesc" : "moments.leaveConfirm"), [
      { text: t("moments.cancel"), style: "cancel" },
      {
        text: t(own ? "moments.delete" : "moments.leave"),
        style: "destructive",
        onPress: () =>
          void onRemove(moment).catch(() => Alert.alert(t(own ? "moments.deleteFailed" : "moments.leaveFailed"))),
      },
    ]);
  };

  return (
    <View className="gap-3 self-center" style={{ width: size }}>
      {/* ── Who · when · menu ── */}
      <View className="flex-row items-center gap-2.5 px-1">
        <View className="flex-row">
          {people.slice(0, 3).map((p, i) => (
            <View key={p.userId} className="rounded-full border-2 border-background" style={{ marginLeft: i ? -10 : 0 }}>
              <PersonAvatar name={p.userName} image={p.userAvatarUrl} size={34} />
            </View>
          ))}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold">
            {others > 0 ? t("moments.collabMembers", { name: author, count: others }) : author}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[12px] text-muted-foreground">{formatRelative(moment.createdAt, i18n.language)}</Text>
            {unseen ? (
              <View className="rounded-full bg-foreground px-1.5 py-px">
                <Text className="text-[10px] font-semibold text-background">{t("moments.new")}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(moment.isOwn ? "moments.delete" : "moments.leave")}
            hitSlop={10}
            onPress={confirmRemove}
            className="size-9 items-center justify-center rounded-full active:bg-muted"
          >
            <Icon as={Ellipsis} size={20} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>

      {/* ── Picture (front) ⇄ memes (back) ── */}
      <View style={{ width: size, height: size * MOMENT_ASPECT }}>
        <GestureDetector gesture={pictureGesture}>
          <Animated.View
            style={[StyleSheet.absoluteFill, frontStyle, { backfaceVisibility: "hidden" }]}
            pointerEvents={flipped ? "none" : "auto"}
            accessibilityRole="button"
            accessibilityLabel={t("moments.flipToMemes")}
            accessibilityHint={t("moments.doubleTapHint")}
            className="overflow-hidden rounded-[36px] bg-muted"
          >
            <MomentMedia moment={moment} active={active && !flipped} />
            {moment.caption ? (
              <View pointerEvents="none" className="absolute inset-x-0 bottom-4 items-center px-6">
                <View className="max-w-full rounded-full bg-black/55 px-4 py-2">
                  <Text numberOfLines={2} className="text-center text-[15px] font-semibold text-white">
                    {moment.caption}
                  </Text>
                </View>
              </View>
            ) : null}
            {burst ? <HeartBurst key={burst} /> : null}
          </Animated.View>
        </GestureDetector>
        {everFlipped ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, backStyle, { backfaceVisibility: "hidden" }]}
            pointerEvents={flipped ? "auto" : "none"}
            className="overflow-hidden rounded-[36px] border border-border bg-card"
          >
            <MemeBack moment={moment} onBack={flip} />
          </Animated.View>
        ) : null}

        {/* Long-press picker, at the bottom-left of the picture (above the reaction button). */}
        {picker ? (
          <>
            <Pressable accessibilityLabel={t("moments.cancel")} style={StyleSheet.absoluteFill} onPress={() => setPicker(false)} />
            <Animated.View
              entering={fadeIn}
              exiting={fadeOut}
              className="absolute bottom-3 left-3 flex-row gap-1 rounded-full bg-black/80 p-1.5"
            >
              {QUICK_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("moments.react")} ${emoji}`}
                  accessibilityState={{ selected: moment.myReaction === emoji }}
                  onPress={() => {
                    onReact(moment, emoji);
                    setPicker(false);
                  }}
                  className={cn("size-11 items-center justify-center rounded-full", moment.myReaction === emoji && "bg-white/25")}
                >
                  <Text className="text-[26px]">{emoji}</Text>
                </Pressable>
              ))}
            </Animated.View>
          </>
        ) : null}
      </View>

      {/* ── Reaction · who reacted · memes ── */}
      <View className="flex-row items-center gap-3">
        <ReactButton
          mine={moment.myReaction}
          onPress={() => {
            setPicker(false);
            onReact(moment, moment.myReaction ?? "❤️");
          }}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            turn("front");
            setPicker(true);
          }}
        />
        <Reactors moment={moment} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("moments.flipToMemes")}
          accessibilityState={{ selected: flipped }}
          onPress={flip}
          className={cn(
            "h-12 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-60",
            flipped ? "bg-foreground" : "bg-muted",
          )}
        >
          <Icon as={Sticker} size={20} className={flipped ? "text-background" : "text-foreground"} />
          <Text className={cn("text-[15px] font-semibold tabular-nums", flipped && "text-background")}>
            {(moment.memeCount ?? 0) > 0 ? moment.memeCount : t("moments.memeTitle")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

/** One round button: my emoji (or an empty heart). Tap = ❤️ / take mine back, hold = picker. */
function ReactButton({ mine, onPress, onLongPress }: { mine: string | null; onPress: () => void; onLongPress: () => void }) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (mine) scale.set(withSequence(withTiming(1.18, PRESS_TIMING), withTiming(1, { duration: APP_DURATION.base, easing: EASE_OUT })));
  }, [mine, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mine ? `${t("moments.react")} ${mine}` : t("moments.react")}
      accessibilityHint={t("moments.reactHint")}
      accessibilityState={{ selected: !!mine }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className="size-12 items-center justify-center rounded-full bg-muted active:opacity-70"
    >
      <Animated.View style={style}>
        {mine ? <Text className="text-[24px]">{mine}</Text> : <Icon as={Heart} size={24} className="text-foreground" />}
      </Animated.View>
    </Pressable>
  );
}

/** Avatars of the latest reactors + per-emoji counts. */
function Reactors({ moment }: { moment: Moment }) {
  const counts = moment.reactions.filter((r) => r.count > 0);
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <View className="flex-row">
        {moment.recentReactions.slice(0, 3).map((r, i) => (
          <View key={r.userId} className="rounded-full border-2 border-background" style={{ marginLeft: i ? -8 : 0 }}>
            <PersonAvatar name={r.userName} image={r.userAvatarUrl} size={24} />
          </View>
        ))}
      </View>
      <Text numberOfLines={1} className="flex-1 text-[13px] text-muted-foreground">
        {counts.map((r) => `${r.emoji} ${r.count}`).join("  ")}
      </Text>
    </View>
  );
}

/** Big white heart flashing over the picture after a double-tap. */
function HeartBurst() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withSequence(withTiming(1, { duration: 220, easing: EASE_OUT }), withTiming(2, { duration: 380, easing: EASE_OUT })),
    );
  }, [progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p <= 1 ? p : 2 - p,
      transform: [{ scale: interpolate(p, [0, 1, 2], [0.6, 1.1, 1]) }],
    };
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
      <Animated.View style={style}>
        <Icon as={Heart} size={96} className="text-white" fill="white" />
      </Animated.View>
    </View>
  );
}
