import { useQueryClient } from "@tanstack/react-query";
import { albumsQueryKey, type Album, type AutoAlbum, type AutoAlbumGroup, autoAlbumName } from "@tng/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Bookmark,
  CalendarDays,
  Check,
  FolderOpen,
  GalleryHorizontalEnd,
  Heart,
  Image as ImageIcon,
  Images,
  Plus,
  ScanSearch,
  Smartphone,
  Sparkles,
  Tags,
  Trash2,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import { useLabels } from "@/features/favorites/useLabels";
import { useSaved } from "@/features/favorites/useSaved";
import { TabScreen } from "@/features/navigation";
import { useTrashSummary } from "@/features/trash/useTrashSummary";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { albumsApi } from "@/services";

import { CoverBadge, CoverCard } from "./components/CoverCard";
import { useAlbumLists, useAutoAlbums } from "./useAlbums";

const GAP = 12;
const ROW_CARD = 148;

const AUTO_ICONS: Record<AutoAlbumGroup, LucideIcon> = {
  type: Images,
  content: Tags,
  time: CalendarDays,
  objects: ScanSearch,
};
const TYPE_ICONS: Record<string, LucideIcon> = {
  "type-photos": ImageIcon,
  "type-videos": Video,
  "type-screenshots": Smartphone,
};

/**
 * Albums tab (web `AlbumsView`): invitations · Collections (Favorites + personal
 * labels) · smart albums (AI) · mine · shared with me · auto albums (every photo
 * is in at least one). User albums = grid; auto groups = horizontal rows (there
 * can be dozens of months / objects), media types = compact tiles.
 */
export function AlbumsScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const lists = useAlbumLists();
  const auto = useAutoAlbums();

  const columns = Math.max(2, Math.floor((width - left - right) / 190));
  const card = (width - left - right - 32 - GAP * (columns - 1)) / columns;

  const data = lists.data;
  const smart = data?.owned.filter((a) => a.kind === "smart") ?? [];
  const manual = data?.owned.filter((a) => a.kind === "manual") ?? [];
  const autoGroups = auto.data?.filter((g) => g.albums.length > 0) ?? [];
  const newAlbum = () => router.push("/album-form");

  return (
    <TabScreen title={t("sidebar.albums", "Albums")} add={["album", "takeout"]}>
      <Animated.View entering={fadeIn} className="gap-8 pb-6 pt-2">
        {data?.invitations.length ? (
          <Section title={t("albums.invitations")} count={data.invitations.length}>
            <Grid>
              {data.invitations.map((album) => (
                <InvitationCard key={album.id} album={album} size={card} />
              ))}
            </Grid>
          </Section>
        ) : null}

        <Collections size={card} />

        {lists.isPending ? (
          <Grid>
            {Array.from({ length: columns * 2 }, (_, i) => (
              <Skeleton key={i} className="rounded-3xl" style={{ width: card, height: card }} />
            ))}
          </Grid>
        ) : lists.isError ? (
          <View className="items-center gap-3 px-8 py-6">
            <Text className="text-center text-[15px] text-muted-foreground">{t("albums.loadFailed")}</Text>
            <Button variant="outline" onPress={() => void lists.refetch()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : (
          <>
            {smart.length ? (
              <Section title={t("albums.smartSection")} count={smart.length} icon={Sparkles}>
                <Grid>
                  {smart.map((album) => (
                    <AlbumCard key={album.id} album={album} size={card} />
                  ))}
                </Grid>
              </Section>
            ) : null}
            <Section
              title={t("albums.mine")}
              count={manual.length}
              action={
                <Pressable
                  accessibilityRole="button"
                  onPress={newAlbum}
                  hitSlop={8}
                  className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5 active:opacity-70"
                >
                  <Icon as={Plus} size={15} />
                  <Text className="text-[13px] font-semibold">{t("albums.newAlbum")}</Text>
                </Pressable>
              }
            >
              {manual.length ? (
                <Grid>
                  {manual.map((album) => (
                    <AlbumCard key={album.id} album={album} size={card} />
                  ))}
                </Grid>
              ) : (
                <View className="mx-4 items-center gap-2 rounded-3xl bg-muted/50 px-6 py-6">
                  <Icon as={FolderOpen} size={28} className="text-muted-foreground/60" />
                  <Text className="text-center text-[14px] text-muted-foreground">{t("albums.empty")}</Text>
                </View>
              )}
            </Section>
            {data?.shared.length ? (
              <Section title={t("albums.sharedWithMe")} count={data.shared.length} icon={Users}>
                <Grid>
                  {data.shared.map((album) => (
                    <AlbumCard key={album.id} album={album} size={card} />
                  ))}
                </Grid>
              </Section>
            ) : null}
          </>
        )}

        {autoGroups.map((group) => (
          <Section
            key={group.id}
            title={t(`albums.auto.groups.${group.id}`)}
            hint={t(`albums.auto.groupHints.${group.id}`)}
            count={group.albums.length}
            icon={AUTO_ICONS[group.id]}
          >
            {group.id === "type" ? (
              <View className="flex-row flex-wrap px-4" style={{ gap: 8 }}>
                {group.albums.map((album) => (
                  <TypeTile key={album.key} album={album} width={(width - left - right - 32 - 8) / 2} />
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="px-4"
                contentContainerStyle={{ gap: GAP }}
              >
                {group.albums.map((album) => (
                  <AutoCard key={album.key} album={album} size={ROW_CARD} />
                ))}
              </ScrollView>
            )}
          </Section>
        ))}
      </Animated.View>
    </TabScreen>
  );
}

function Section({
  title,
  hint,
  count,
  icon,
  action,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 px-4">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            {icon ? <Icon as={icon} size={17} className="text-foreground" /> : null}
            <Text className="text-[20px] font-semibold">{title}</Text>
            {count ? <Text className="text-[15px] text-muted-foreground">{count}</Text> : null}
          </View>
          {hint ? <Text className="text-[13px] text-muted-foreground">{hint}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
      {children}
    </View>
  );
}

/** Favorites (hearted or labeled) + one card per personal label → `/favorites?filter=` + Swipe to clean → `/review` + Trash last → `/trash`. */
function Collections({ size }: { size: number }) {
  const { t } = useTranslation();
  const { labels, totals } = useLabels();
  const cover = useSaved("all", { limit: 1 });
  const first = cover.data?.items[0];
  const trash = useTrashSummary();
  return (
    <Section title={t("albums.collections")}>
      <Grid>
        <CoverCard
          size={size}
          icon={Heart}
          iconClass="text-rose-500"
          leading={<Icon as={Heart} size={15} className="text-rose-500" fill="currentColor" />}
          title={t("favorites.title")}
          subtitle={t("albums.photoCount", { n: totals.all })}
          cover={first?.thumbnailUrlLarge ?? first?.thumbnailUrl ?? null}
          onPress={() => router.push("/favorites")}
        />
        {labels.map((label) => (
          <CoverCard
            key={label.id}
            size={size}
            icon={Bookmark}
            leading={<View className={cn("size-2.5 rounded-full", LABEL_DOT[label.color] ?? LABEL_DOT.slate)} />}
            title={label.name}
            subtitle={t("albums.photoCount", { n: label.count })}
            cover={label.coverUrl}
            onPress={() => router.push({ pathname: "/favorites", params: { filter: label.id } })}
          />
        ))}
        <CoverCard
          size={size}
          icon={GalleryHorizontalEnd}
          leading={<Icon as={GalleryHorizontalEnd} size={15} className="text-muted-foreground" />}
          title={t("review.title")}
          subtitle={t("review.cardSubtitle")}
          cover={null}
          onPress={() => router.push("/review")}
        />
        <CoverCard
          size={size}
          icon={Trash2}
          leading={<Icon as={Trash2} size={15} className="text-muted-foreground" />}
          title={t("trash.title")}
          subtitle={t("albums.photoCount", { n: trash.count })}
          cover={trash.cover}
          onPress={() => router.push("/trash")}
        />
      </Grid>
    </Section>
  );
}

/** Album card: smart / members badges; shared → "<owner> shared · role". */
function AlbumCard({ album, size }: { album: Album; size: number }) {
  const { t } = useTranslation();
  const shared = album.memberCount > 0 || album.role !== "owner";
  return (
    <CoverCard
      size={size}
      title={album.name}
      subtitle={
        album.role === "owner"
          ? t("albums.photoCount", { n: album.mediaCount })
          : t("albums.sharedBy", { name: album.owner.name ?? "", role: t(`albums.roles.${album.role}`) })
      }
      cover={album.coverUrl}
      icon={album.kind === "smart" ? Sparkles : Images}
      overlay={
        album.kind === "smart" || shared ? (
          <>
            {album.kind === "smart" ? <CoverBadge icon={Sparkles} label={t("albums.smartBadge")} /> : null}
            {shared ? <CoverBadge icon={Users} label={String(album.memberCount + 1)} /> : null}
          </>
        ) : null
      }
      onPress={() => router.push({ pathname: "/albums/[id]", params: { id: album.id } })}
    />
  );
}

/** Pending invitation: Join (→ opens the album) / Decline. */
function InvitationCard({ album, size }: { album: Album; size: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await albumsApi.respondAlbumInvitation(album.id, accept);
      await queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      if (accept) router.push({ pathname: "/albums/[id]", params: { id: album.id } });
    } catch {
      Alert.alert(t("lightbox.actionFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <CoverCard
      size={size}
      title={album.name}
      subtitle={t("albums.sharedBy", { name: album.owner.name ?? "", role: t(`albums.roles.${album.role}`) })}
      cover={album.coverUrl}
      footer={
        <View className="flex-row gap-2">
          <Button size="sm" className="flex-1 rounded-full" disabled={busy} onPress={() => void respond(true)}>
            <Icon as={Check} size={16} className="text-primary-foreground" />
            <Text>{t("albums.accept")}</Text>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            accessibilityLabel={t("albums.decline")}
            onPress={() => void respond(false)}
          >
            <Icon as={X} size={16} />
          </Button>
        </View>
      }
    />
  );
}

function AutoCard({ album, size }: { album: AutoAlbum; size: number }) {
  const { t, i18n } = useTranslation();
  return (
    <CoverCard
      size={size}
      title={autoAlbumName(album, t, i18n.language)}
      subtitle={t("albums.photoCount", { n: album.count })}
      cover={album.coverUrl}
      onPress={() => router.push({ pathname: "/albums/auto/[key]", params: { key: album.key } })}
    />
  );
}

/** Media type (photos / videos / screenshots): compact row tile. */
function TypeTile({ album, width }: { album: AutoAlbum; width: number }) {
  const { t, i18n } = useTranslation();
  const TypeIcon = TYPE_ICONS[album.key] ?? Images;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/albums/auto/[key]", params: { key: album.key } })}
      className="flex-row items-center gap-3 rounded-2xl bg-muted/60 p-2 pr-3 active:opacity-70"
      style={{ width }}
    >
      <View className="size-12 items-center justify-center overflow-hidden rounded-xl bg-muted">
        <AutoCover uri={album.coverUrl} icon={TypeIcon} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[15px] font-semibold">
          {autoAlbumName(album, t, i18n.language)}
        </Text>
        <Text className="text-[13px] text-muted-foreground">{t("albums.photoCount", { n: album.count })}</Text>
      </View>
    </Pressable>
  );
}

function AutoCover({ uri, icon }: { uri: string | null; icon: LucideIcon }) {
  if (!uri) return <Icon as={icon} size={20} className="text-muted-foreground" />;
  return <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk" style={{ width: "100%", height: "100%" }} />;
}
