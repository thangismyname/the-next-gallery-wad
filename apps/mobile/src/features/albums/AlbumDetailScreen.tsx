import type { Album, MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Check, ChevronLeft, Ellipsis, ImageMinus, Images, LogOut, Pencil, Sparkles, Star, Trash2, Unlink } from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { GlassMenu, type GlassMenuItem } from "@/components/shared/GlassMenu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useSession } from "@/features/auth/session";
import { GRID_BAR, MediaGridScreen } from "@/features/gallery/components/MediaGridScreen";
import type { LightboxAction } from "@/features/gallery/lightbox/Lightbox";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { fadeIn } from "@/lib/motion";
import { albumsApi } from "@/services";

import { useAlbumDetail } from "./useAlbums";

type Confirm = "delete" | "leave" | "convert";

/**
 * One album (web `AlbumDetailView`, route `/albums/<id>`): header (cover, badges,
 * description, smart rule, counts) · ⋯ menu (owner: edit · convert smart → manual
 * · delete; member: leave) · photo grid + Lightbox with "Set as cover" (owner) and
 * "Remove from album" (manual: owner or whoever added it). In a shared album only
 * your own photos get heart / trash / labels. Pending invitation → Join / Decline.
 */
export function AlbumDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const me = useSession().data?.user.id;
  const { albumQuery, album, media, items, refresh } = useAlbumDetail(id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOwner = album?.role === "owner";
  const manual = album?.kind === "manual";

  /** Run an album action, refresh, then `after` (e.g. leave the screen). */
  const run = useCallback(
    async (action: () => Promise<unknown>, after?: () => void) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        after?.();
      } catch {
        Alert.alert(t("lightbox.actionFailed"));
      } finally {
        setBusy(false);
      }
    },
    [refresh, t],
  );

  const confirm = (kind: Confirm) => {
    if (!album) return;
    setMenuOpen(false);
    Alert.alert(t(`albums.confirm.${kind}.title`), t(`albums.confirm.${kind}.desc`, { name: album.name, n: 0 }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t(`albums.confirm.${kind}.action`),
        style: kind === "convert" ? "default" : "destructive",
        onPress: () => {
          if (kind === "delete") void run(() => albumsApi.deleteAlbum(album.id), router.back);
          else if (kind === "leave" && me) void run(() => albumsApi.removeAlbumMember(album.id, me), router.back);
          else if (kind === "convert") void run(() => albumsApi.convertAlbum(album.id));
        },
      },
    ]);
  };

  const menuItems: GlassMenuItem[] = album
    ? [
        ...(isOwner
          ? [
              {
                key: "edit",
                label: t("albums.edit"),
                icon: Pencil,
                onPress: () => {
                  setMenuOpen(false);
                  router.push({ pathname: "/album-form", params: { id: album.id } });
                },
              },
            ]
          : []),
        ...(isOwner && !manual ? [{ key: "convert", label: t("albums.convert"), icon: Unlink, onPress: () => confirm("convert") }] : []),
        ...(isOwner
          ? [{ key: "delete", label: t("albums.delete"), icon: Trash2, destructive: true, onPress: () => confirm("delete") }]
          : [{ key: "leave", label: t("albums.leave"), icon: LogOut, destructive: true, onPress: () => confirm("leave") }]),
      ]
    : [];

  const addedBy = useMemo(() => new Map(items.map((m) => [m.id, m.addedBy ?? null])), [items]);
  const ownerOf = useMemo(() => new Map(items.map((m) => [m.id, m.ownerId ?? null])), [items]);
  const lightboxActions = useMemo<LightboxAction[]>(() => {
    if (!album) return [];
    const list: LightboxAction[] = [];
    if (isOwner)
      list.push({
        key: "cover",
        label: t("albums.setCover"),
        icon: Star,
        doneKey: "albums.coverSet",
        onPress: (item) => albumsApi.updateAlbum(album.id, { coverMediaId: item.id }).then(refresh),
      });
    if (manual && (isOwner || album.role === "editor"))
      list.push({
        key: "remove",
        label: t("albums.removeFromAlbum"),
        icon: ImageMinus,
        destructive: true,
        doneKey: "albums.removed",
        hidden: (item) => !isOwner && addedBy.get(item.id) !== me,
        onPress: (item) => albumsApi.removeAlbumMedia(album.id, [item.id]).then(refresh),
      });
    return list;
  }, [album, isOwner, manual, addedBy, me, refresh, t]);
  const canEdit = useCallback(
    (item: MediaListItem) => {
      const owner = ownerOf.get(item.id);
      return !owner || owner === me;
    },
    [ownerOf, me],
  );

  if (albumQuery.isPending) return <Placeholder />;
  if (!album) return <Missing />;
  if (album.pending) return <Invitation album={album} busy={busy} run={run} />;

  const menuTop = insets.top + 8 + GRID_BAR + 8;
  return (
    <MediaGridScreen
      portal="album-lightbox"
      backLabel={t("albums.title")}
      items={items}
      isPending={media.isPending}
      isError={media.isError}
      refreshing={media.isRefetching && !media.isFetchingNextPage}
      onRefresh={() => void refresh()}
      hasNextPage={media.hasNextPage}
      loadingMore={media.isFetchingNextPage}
      onLoadMore={() => void media.fetchNextPage()}
      lightboxActions={lightboxActions}
      canEdit={canEdit}
      topRight={
        <GlassButton
          size={GRID_BAR}
          accessibilityLabel={t("albums.more")}
          accessibilityState={{ expanded: menuOpen }}
          disabled={busy}
          onPress={() => setMenuOpen((v) => !v)}
        >
          <Icon as={Ellipsis} size={22} />
        </GlassButton>
      }
      overlay={
        menuOpen ? (
          <>
            <Pressable accessibilityLabel={t("common.cancel")} onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
            <View pointerEvents="box-none" className="absolute" style={{ top: menuTop, right: insets.right + 16 }}>
              <GlassMenu items={menuItems} width={250} />
            </View>
          </>
        ) : null
      }
      header={<AlbumHeader album={album} />}
      empty={
        <Animated.View entering={fadeIn} className="items-center gap-3 px-8 pt-12">
          <Icon as={Images} size={40} className="text-muted-foreground/50" />
          <Text className="text-center text-[15px] text-muted-foreground">
            {manual ? t("albums.emptyAlbum") : t("albums.smart.empty")}
          </Text>
          {manual && (isOwner || album.role === "editor") ? (
            <Text className="text-center text-[13px] text-muted-foreground">{t("albums.addHint")}</Text>
          ) : null}
        </Animated.View>
      }
    />
  );
}

function AlbumHeader({ album }: { album: Album }) {
  const { t } = useTranslation();
  const { describe } = useTagCatalog(album.smartRule?.type === "tags");
  const rule = album.smartRule;
  return (
    <View className="flex-row gap-4 px-4">
      <View className="size-24 items-center justify-center overflow-hidden rounded-3xl bg-muted">
        {album.coverUrl ? (
          <Image source={{ uri: album.coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        ) : (
          <Icon as={Images} size={30} className="text-muted-foreground/50" />
        )}
      </View>
      <View className="flex-1 justify-center gap-1">
        {album.kind === "smart" || album.role !== "owner" ? (
          <View className="flex-row flex-wrap items-center gap-1.5">
            {album.kind === "smart" ? (
              <View className="flex-row items-center gap-1 rounded-full bg-foreground px-2 py-0.5">
                <Icon as={Sparkles} size={12} className="text-background" />
                <Text className="text-[11px] font-semibold text-background">{t("albums.smartBadge")}</Text>
              </View>
            ) : null}
            {album.role !== "owner" ? (
              <Text numberOfLines={1} className="text-[12px] text-muted-foreground">
                {t("albums.sharedBy", { name: album.owner.name ?? "", role: t(`albums.roles.${album.role}`) })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text numberOfLines={2} className="font-heading text-[28px] font-semibold leading-tight">
          {album.name}
        </Text>
        {album.description ? (
          <Text numberOfLines={2} className="text-[14px] text-muted-foreground">
            {album.description}
          </Text>
        ) : null}
        {rule ? (
          <View className="flex-row flex-wrap items-center gap-1">
            <Text className="text-[12px] text-muted-foreground">{t("albums.smart.rule")}:</Text>
            {rule.type === "tags" ? (
              rule.tags.map((tag) => (
                <View key={tag} className="rounded-full border border-border px-2 py-px">
                  <Text className="text-[11px]">{describe(tag)?.name ?? tag}</Text>
                </View>
              ))
            ) : (
              <Text className="text-[12px] font-medium">“{rule.query}”</Text>
            )}
          </View>
        ) : null}
        <Text className="text-[13px] text-muted-foreground">
          {t("albums.photoCount", { n: album.mediaCount })}
          {album.memberCount > 0 ? ` · ${t("albums.memberCount", { n: album.memberCount + 1 })}` : ""}
        </Text>
      </View>
    </View>
  );
}

function Invitation({
  album,
  busy,
  run,
}: {
  album: Album;
  busy: boolean;
  run: (action: () => Promise<unknown>, after?: () => void) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <Centered>
      <Text className="text-center text-[15px] text-muted-foreground">
        {t("albums.inviteToastBody", { name: album.owner.name ?? "", album: album.name })}
      </Text>
      <View className="flex-row gap-2">
        <Button className="rounded-full" disabled={busy} onPress={() => void run(() => albumsApi.respondAlbumInvitation(album.id, true))}>
          <Icon as={Check} size={16} className="text-primary-foreground" />
          <Text>{t("albums.accept")}</Text>
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          disabled={busy}
          onPress={() => void run(() => albumsApi.respondAlbumInvitation(album.id, false), router.back)}
        >
          <Text>{t("albums.decline")}</Text>
        </Button>
      </View>
    </Centered>
  );
}

function Missing() {
  const { t } = useTranslation();
  return (
    <Centered>
      <Icon as={Images} size={40} className="text-muted-foreground/50" />
      <Text className="text-center text-[15px] text-muted-foreground">{t("albums.notFound")}</Text>
      <Button variant="outline" className="rounded-full" onPress={() => router.back()}>
        <Text>{t("common.back")}</Text>
      </Button>
    </Centered>
  );
}

function Placeholder() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 flex-row gap-4 bg-background px-4" style={{ paddingTop: insets.top + 68 }}>
      <Skeleton className="size-24 rounded-3xl" />
      <View className="flex-1 gap-2 pt-3">
        <Skeleton className="h-7 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-1/3 rounded-lg" />
      </View>
    </View>
  );
}

function Centered({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-4 px-8">{children}</View>
      <View className="absolute left-0 top-0" style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16 }}>
        <GlassButton size={GRID_BAR} accessibilityLabel={t("common.back")} onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </GlassButton>
      </View>
    </View>
  );
}
