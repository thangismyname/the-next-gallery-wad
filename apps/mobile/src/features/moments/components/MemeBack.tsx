import { formatRelative, type Moment, type MomentMeme } from "@tng/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronLeft, Heart, ImageOff, Plus, Sticker, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
// Gesture-handler FlatList: scrolls reliably inside the card's RNGH tap gestures.
import { FlatList } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

import { useMomentMemes } from "../useMomentMemes";
import { PersonAvatar } from "@/components/shared/PersonAvatar";

/** Side gutters of a meme row (avatar on one side, ❤️ on the other). */
const GUTTER = 40;

/**
 * Back of a moment card — same design as the web `MomentMemePanel`: header (‹
 * back · Meme (n)), the memes as a comment thread (meme in the middle; the
 * dropper's avatar in a side gutter — moment author on the right, others on the
 * left — and ❤️ + count in the opposite gutter; name · time · delete under it,
 * on the avatar's side), and a full-width "Drop a meme" bar. Tapping a meme turns
 * the card back.
 */
export function MemeBack({ moment, onBack }: { moment: Moment; onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const memes = useMomentMemes(moment.id);

  const confirmDelete = (meme: MomentMeme) =>
    Alert.alert(t("moments.memeDeleteConfirm"), undefined, [
      { text: t("moments.cancel"), style: "cancel" },
      {
        text: t("moments.memeDelete"),
        style: "destructive",
        onPress: () => void memes.remove(meme).catch(() => Alert.alert(t("moments.memeDeleteFailed"))),
      },
    ]);

  return (
    <View className="flex-1 bg-card">
      {/* ── Header ── */}
      <View className="h-12 flex-row items-center gap-2 border-b border-border px-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("moments.memeBack")}
          hitSlop={8}
          onPress={onBack}
          className="size-8 items-center justify-center rounded-full active:bg-muted"
        >
          <Icon as={ChevronLeft} size={20} className="text-muted-foreground" />
        </Pressable>
        <Icon as={Sticker} size={16} className="text-foreground" />
        <Text numberOfLines={1} className="text-[14px] font-semibold">
          {t("moments.memeTitle")}
        </Text>
        <Text className="text-[12px] text-muted-foreground">({moment.memeCount ?? 0})</Text>
      </View>

      {/* ── Thread ── */}
      <FlatList
        data={memes.memes}
        keyExtractor={(m) => m.id}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 20, padding: 12 }}
        onEndReached={() => {
          if (memes.hasNextPage && !memes.isFetchingNextPage) void memes.fetchNextPage();
        }}
        onEndReachedThreshold={1}
        renderItem={({ item }) => (
          <MemeRow
            meme={item}
            byAuthor={item.userId === moment.userId}
            onOpen={onBack}
            onHeart={() => void memes.toggleHeart(item)}
            onDelete={item.isOwn ? () => confirmDelete(item) : undefined}
          />
        )}
        ListEmptyComponent={
          memes.isPending ? (
            <View className="gap-4">
              {[0, 1].map((i) => (
                <View key={i} className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </View>
                  <Skeleton className="h-24 w-full rounded-xl" />
                </View>
              ))}
            </View>
          ) : memes.isError ? (
            <View className="items-center gap-2 py-8">
              <Text className="text-center text-[12px] text-muted-foreground">{t("moments.memeLoadFailed")}</Text>
              <Pressable onPress={() => void memes.refetch()} className="rounded-full bg-muted px-3 py-1 active:opacity-70">
                <Text className="text-[12px]">{t("moments.retry")}</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center gap-2 py-10">
              <View className="size-11 items-center justify-center rounded-full bg-muted">
                <Icon as={Sticker} size={20} className="text-muted-foreground" />
              </View>
              <Text className="text-center text-[14px]">{t("moments.memeEmpty")}</Text>
              <Text className="text-center text-[12px] text-muted-foreground">{t("moments.memeEmptyHint")}</Text>
            </View>
          )
        }
        ListFooterComponent={
          memes.isFetchingNextPage ? <ActivityIndicator color={colors.mutedForeground} className="py-2" /> : undefined
        }
      />

      {/* ── Composer ── */}
      <View className="border-t border-border p-2.5">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/moment-memes", params: { id: moment.id, start: "templates" } })}
          className="h-10 flex-row items-center justify-center gap-1.5 rounded-full bg-muted active:opacity-70"
        >
          <Icon as={Plus} size={16} className="text-foreground" />
          <Text className="text-[14px] font-medium">{t("moments.memeAdd")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MemeRow({
  meme,
  byAuthor,
  onOpen,
  onHeart,
  onDelete,
}: {
  meme: MomentMeme;
  /** Dropped by the moment's author → avatar on the right (like a chat reply). */
  byAuthor: boolean;
  onOpen: () => void;
  onHeart: () => void;
  onDelete?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [failed, setFailed] = useState(false);

  const avatar = <PersonAvatar name={meme.userName} image={meme.userAvatarUrl} size={24} />;
  const heart = (
    <View className="items-center gap-0.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(meme.myReact ? "moments.memeUnreact" : "moments.memeReact")}
        accessibilityState={{ selected: meme.myReact }}
        accessibilityHint={meme.reactNames.length ? meme.reactNames.join(", ") : undefined}
        hitSlop={6}
        onPress={onHeart}
        className={cn("size-8 items-center justify-center rounded-full active:opacity-70", meme.myReact ? "bg-destructive/15" : "bg-muted")}
      >
        <Icon
          as={Heart}
          size={16}
          className={meme.myReact ? "text-destructive" : "text-muted-foreground"}
          fill={meme.myReact ? "currentColor" : "none"}
        />
      </Pressable>
      {meme.reactCount > 0 ? (
        <Text className={cn("text-[10px] tabular-nums", meme.myReact ? "text-destructive" : "text-muted-foreground")}>
          {meme.reactCount}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="gap-1.5">
      <View className="flex-row gap-2">
        <View className="items-center justify-center" style={{ width: GUTTER }}>
          {byAuthor ? heart : avatar}
        </View>
        <View className="flex-1 gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("moments.memeBack")}
            onPress={onOpen}
            className="h-44 overflow-hidden rounded-xl border border-border bg-muted active:opacity-80"
          >
            {failed ? (
              <View className="flex-1 items-center justify-center gap-1">
                <Icon as={ImageOff} size={18} className="text-muted-foreground" />
                <Text className="text-[11px] text-muted-foreground">{t("moments.memeLoadFailed")}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: meme.imageUrl }}
                contentFit="cover"
                transition={150}
                recyclingKey={meme.id}
                onError={() => setFailed(true)}
                style={{ width: "100%", height: "100%" }}
              />
            )}
          </Pressable>
          {meme.caption ? <Text className="text-[12px] leading-relaxed text-muted-foreground">{meme.caption}</Text> : null}
        </View>
        <View className="items-center justify-center" style={{ width: GUTTER }}>
          {byAuthor ? avatar : heart}
        </View>
      </View>

      {/* Name · time · delete — under the meme, on the avatar's side. */}
      <View className={cn("flex-row flex-wrap items-center gap-x-1.5", byAuthor && "flex-row-reverse")}>
        <Text numberOfLines={1} className="max-w-full text-[11px] font-medium">
          {meme.isOwn ? t("moments.you") : meme.userName}
        </Text>
        <Text className="text-[10px] text-muted-foreground/70">{formatRelative(meme.createdAt, i18n.language)}</Text>
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("moments.memeDelete")}
            hitSlop={6}
            onPress={onDelete}
            className="size-6 items-center justify-center rounded-full active:bg-muted"
          >
            <Icon as={Trash2} size={14} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
