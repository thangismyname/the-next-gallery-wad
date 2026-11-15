import type { MemeTemplate, MomentMeme } from "@tng/shared";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Heart, ImageOff, Plus, Search, Sticker, Trash2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { normalize } from "@/features/studio/tagCatalog";

import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { useMemeTemplates, useMomentMemes } from "./useMomentMemes";

type Step = { kind: "list" } | { kind: "templates" } | { kind: "compose"; template: MemeTemplate };

/** Same limit as the backend (`createMemeSchema.lines`): ≤ 5 lines of ≤ 80 chars. */
const MAX_LINES = 5;

/**
 * Memes of a moment (web `MomentMemePanel` + `MemePickerDialog`), modal route
 * `/moment-memes?id=`: list (newest first, ❤️ toggle, delete own) → "Drop a meme"
 * → memegen template grid (search) → text lines (optional — empty = the original
 * meme) → created, back to the list.
 */
export function MomentMemesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id = "", start } = useLocalSearchParams<{ id: string; start?: string }>();
  // Opened from the back of a card ("Drop a meme") → straight to the templates,
  // and the modal closes once the meme is posted (the card's back shows it).
  const direct = start === "templates";
  const [step, setStep] = useState<Step>(direct ? { kind: "templates" } : { kind: "list" });
  const memes = useMomentMemes(id);

  const back = () => {
    if (step.kind === "compose") setStep({ kind: "templates" });
    else if (direct) router.back();
    else setStep({ kind: "list" });
  };
  const closes = step.kind === "list" || (direct && step.kind === "templates");
  const title =
    step.kind === "list" ? t("moments.memeTitle") : step.kind === "templates" ? t("moments.memePick") : step.template.name;

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Platform.OS === "ios" ? 16 : insets.top + 12 }}
      >
        <GlassButton
          size={40}
          accessibilityLabel={closes ? t("moments.close") : t("moments.back")}
          onPress={step.kind === "list" ? () => router.back() : back}
        >
          <Icon as={closes ? X : ChevronLeft} size={20} />
        </GlassButton>
        <Text numberOfLines={1} className="flex-1 text-center text-[17px] font-semibold">
          {title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {step.kind === "list" ? (
        <MemeList memes={memes} onAdd={() => setStep({ kind: "templates" })} />
      ) : step.kind === "templates" ? (
        <TemplatePicker onPick={(template) => setStep({ kind: "compose", template })} />
      ) : (
        <Compose
          template={step.template}
          onCreate={async (lines) => {
            await memes.create(step.template.id, lines);
            if (direct) router.back();
            else setStep({ kind: "list" });
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function MemeList({ memes, onAdd }: { memes: ReturnType<typeof useMomentMemes>; onAdd: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(520, width - 32);

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
    <View className="flex-1">
      <FlatList
        data={memes.memes}
        keyExtractor={(m) => m.id}
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        onEndReached={() => {
          if (memes.hasNextPage && !memes.isFetchingNextPage) void memes.fetchNextPage();
        }}
        onEndReachedThreshold={1}
        renderItem={({ item }) => (
          <View className="gap-2 self-center" style={{ width: size }}>
            <View className="flex-row items-center gap-2">
              <PersonAvatar name={item.userName} image={item.userAvatarUrl} size={28} />
              <Text numberOfLines={1} className="flex-1 text-[14px] font-semibold">
                {item.isOwn ? t("moments.you") : item.userName}
              </Text>
              {item.isOwn ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("moments.memeDelete")}
                  hitSlop={8}
                  onPress={() => confirmDelete(item)}
                  className="size-8 items-center justify-center rounded-full active:bg-muted"
                >
                  <Icon as={Trash2} size={16} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>
            <MemeImage uri={item.imageUrl} width={size} />
            {item.caption ? <Text className="text-[14px]">{item.caption}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(item.myReact ? "moments.memeUnreact" : "moments.memeReact")}
              accessibilityState={{ selected: item.myReact }}
              onPress={() => void memes.toggleHeart(item)}
              className="flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1.5 active:opacity-60"
            >
              <Icon
                as={Heart}
                size={16}
                className={item.myReact ? "text-red-500" : "text-muted-foreground"}
                fill={item.myReact ? "currentColor" : "none"}
              />
              <Text className="text-[14px] tabular-nums">{item.reactCount}</Text>
              {item.reactNames.length ? (
                <Text numberOfLines={1} className="max-w-48 text-[12px] text-muted-foreground">
                  · {item.reactNames.slice(0, 3).join(", ")}
                </Text>
              ) : null}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          memes.isPending ? (
            <ActivityIndicator className="pt-16" color={colors.mutedForeground} />
          ) : memes.isError ? (
            <Centered icon={ImageOff} title={t("moments.memeLoadFailed")}>
              <Button variant="outline" onPress={() => void memes.refetch()}>
                <Text>{t("moments.retry")}</Text>
              </Button>
            </Centered>
          ) : (
            <Centered icon={Sticker} title={t("moments.memeEmpty")} hint={t("moments.memeEmptyHint")} />
          )
        }
        ListFooterComponent={
          memes.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.mutedForeground} /> : undefined
        }
      />
      <View className="absolute inset-x-0 items-center" style={{ bottom: insets.bottom + 20 }}>
        <Button className="h-12 rounded-full px-6" onPress={onAdd}>
          <Icon as={Plus} size={18} className="text-primary-foreground" />
          <Text>{t("moments.memeAdd")}</Text>
        </Button>
      </View>
    </View>
  );
}

/** Meme picture at its own aspect ratio (memegen sizes vary); failed load → placeholder. */
function MemeImage({ uri, width }: { uri: string; width: number }) {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState(1);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View className="items-center justify-center gap-1 rounded-3xl bg-muted" style={{ width, height: width * 0.6 }}>
        <Icon as={ImageOff} size={22} className="text-muted-foreground" />
        <Text className="text-[12px] text-muted-foreground">{t("moments.memeLoadFailed")}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      contentFit="contain"
      transition={150}
      onLoad={(e) => e.source.width && setRatio(e.source.width / e.source.height)}
      onError={() => setFailed(true)}
      style={{ width, height: width / ratio, borderRadius: 24 }}
      className="bg-muted"
    />
  );
}

function TemplatePicker({ onPick }: { onPick: (template: MemeTemplate) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState("");
  const templates = useMemeTemplates(true);
  const columns = width >= 700 ? 4 : 3;
  const cell = (Math.min(width, 900) - 32 - 8 * (columns - 1)) / columns;

  const list = useMemo(() => {
    const query = normalize(q.trim());
    const all = templates.data ?? [];
    return query ? all.filter((tp) => normalize(tp.name).includes(query) || tp.id.includes(query)) : all;
  }, [templates.data, q]);

  return (
    <View className="flex-1">
      <FilterField value={q} onChangeText={setQ} placeholder={t("moments.memeSearch")} className="mx-4 mb-3 rounded-full" />
      {templates.isPending ? (
        <ActivityIndicator className="pt-16" color={colors.mutedForeground} />
      ) : templates.isError ? (
        <Centered icon={ImageOff} title={t("moments.memeTemplateFailed")}>
          <Button variant="outline" onPress={() => void templates.refetch()}>
            <Text>{t("moments.retry")}</Text>
          </Button>
        </Centered>
      ) : (
        <FlatList
          key={columns}
          data={list}
          numColumns={columns}
          keyExtractor={(tp) => tp.id}
          keyboardDismissMode="on-drag"
          columnWrapperClassName="gap-2"
          contentContainerClassName="gap-2 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          initialNumToRender={18}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => onPick(item)}
              className="gap-1 active:opacity-70"
              style={{ width: cell }}
            >
              <Image
                source={{ uri: item.blankUrl }}
                contentFit="cover"
                recyclingKey={item.id}
                style={{ width: cell, height: cell, borderRadius: 16 }}
                className="bg-muted"
              />
              <Text numberOfLines={1} className="text-[12px] text-muted-foreground">
                {item.name}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<Centered icon={Search} title={t("moments.memeSearchEmpty")} />}
        />
      )}
    </View>
  );
}

function Compose({ template, onCreate }: { template: MemeTemplate; onCreate: (lines: string[]) => Promise<void> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const count = Math.min(MAX_LINES, Math.max(1, template.lines));
  const [lines, setLines] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = Math.min(width - 32, 420);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(lines.map((l) => l.trim()));
    } catch {
      setError(t("moments.memeCreateFailed"));
      setBusy(false);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center gap-4 px-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <Image
        source={{ uri: template.blankUrl }}
        contentFit="contain"
        style={{ width: size, height: size, borderRadius: 24 }}
        className="bg-muted"
      />
      <Text className="self-stretch text-[13px] text-muted-foreground">{t("moments.memeTextOptional")}</Text>
      {lines.map((line, i) => (
        <Input
          key={i}
          value={line}
          maxLength={80}
          editable={!busy}
          onChangeText={(v) => setLines((ls) => ls.map((x, j) => (j === i ? v : x)))}
          placeholder={t("moments.memeTextPlaceholder", { n: i + 1 })}
          returnKeyType={i === lines.length - 1 ? "done" : "next"}
          className="h-12 self-stretch rounded-2xl text-[16px]"
        />
      ))}
      {error ? <Text className="self-stretch text-[14px] text-destructive">{error}</Text> : null}
      <Button className={cn("h-12 self-stretch rounded-full")} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
        <Text>{t("moments.memeCreate")}</Text>
      </Button>
    </ScrollView>
  );
}

function Centered({
  icon,
  title,
  hint,
  children,
}: {
  icon: typeof Sticker;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-16">
      <Icon as={icon} size={40} className="text-muted-foreground/50" />
      <Text className="text-center text-[16px] font-semibold">{title}</Text>
      {hint ? <Text className="text-center text-[14px] text-muted-foreground">{hint}</Text> : null}
      {children}
    </Animated.View>
  );
}
