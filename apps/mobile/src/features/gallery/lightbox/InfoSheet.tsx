import {
  formatBytes,
  formatDateTime,
  formatDuration,
  isLabelTag,
  tagColor,
  type MediaListItem,
  type MediaTag,
} from "@tng/shared";
import { Image } from "expo-image";
import { FolderOpen, ScanSearch, Sparkles, Images, Tag, type LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import { useLabels, useMediaLabels } from "@/features/favorites/useLabels";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { useTheme } from "@/hooks/useTheme";
import { AI_CHIP, TAG_CHIP } from "@/lib/aiColors";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

import type { ViewerValues } from "./useViewerGestures";
import { YOLO_SEARCH_MIN_CONF, useMediaDetails } from "./useMediaDetails";

/** Below-threshold tags: show only the strongest few (dashed) — what the model "thought". */
const MAX_WEAK = 4;
const SIMILAR_COLUMNS = 4;

/**
 * Details sheet that slides up from the bottom when the photo is dragged up
 * (iOS Photos style); follows `info` (0 → 1) on the UI thread. Content longer
 * than the sheet scrolls with the same drag (`infoScroll`, driven by
 * `useViewerGestures` — no nested ScrollView fighting the viewer's pan).
 *
 * Sections (web `MediaDetailsPanel`): metadata · AI content tags (17 categories
 * + detailed labels, %) · YOLO objects · personal labels · albums containing it ·
 * similar photos (DINOv3, CLIP fallback; tap → that photo). Data loads only
 * while `active` (sheet open).
 */
export function InfoSheet({
  item,
  values,
  sheetHeight,
  bottomInset,
  active,
  onSelectSimilar,
}: {
  item: MediaListItem;
  values: ViewerValues;
  sheetHeight: number;
  bottomInset: number;
  active: boolean;
  onSelectSimilar: (item: MediaListItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const { info, infoScroll, infoOverflow } = values;
  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // How far the content can scroll (read by the viewer's pan).
  useEffect(() => {
    infoOverflow.set(Math.max(contentH - viewportH, 0));
  }, [contentH, viewportH, infoOverflow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - info.get()) * (sheetHeight + 40) }],
  }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -infoScroll.get() }] }));
  const thumbStyle = useAnimatedStyle(() => {
    const max = infoOverflow.get();
    if (max <= 0 || viewportH <= 0) return { opacity: 0 };
    const h = Math.max((viewportH * viewportH) / (viewportH + max), 24);
    return { opacity: infoScroll.get() > 0 ? 0.5 : 0, height: h, transform: [{ translateY: (infoScroll.get() / max) * (viewportH - h) }] };
  }, [viewportH]);

  const taken = item.takenAt ? formatDateTime(item.takenAt, i18n.language) : null;
  const added = item.createdAt ? formatDateTime(item.createdAt, i18n.language) : null;
  const resolution = item.width && item.height ? `${item.width} × ${item.height}` : null;

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 px-3"
      style={[{ height: sheetHeight, paddingBottom: Math.max(bottomInset, 12) }, style]}
    >
      <GlassPanel radius={30} padding={0} fill>
        <View className="mb-1 mt-3 h-1 w-10 self-center rounded-full bg-foreground/25" />
        <View
          className="flex-1 overflow-hidden"
          onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        >
          <Animated.View
            style={contentStyle}
            onLayout={(e) => setContentH(e.nativeEvent.layout.height)}
            className="px-5 pb-6 pt-2"
          >
            {taken || added ? (
              <Text className="font-heading text-2xl font-semibold">{taken ?? added}</Text>
            ) : null}
            {item.title ? (
              <Text numberOfLines={1} className="mt-1 text-[15px] text-muted-foreground">
                {item.title}
              </Text>
            ) : null}
            {item.caption ? <Text className="mt-2 text-[15px]">{item.caption}</Text> : null}
            <View className="mt-4 gap-3">
              <Row label={t("lightbox.detailType")}>
                {item.mediaType === "video" ? t("lightbox.video") : t("lightbox.photo")}
                {item.mimeType ? ` · ${item.mimeType.split("/")[1]?.toUpperCase()}` : ""}
              </Row>
              {resolution ? <Row label={t("lightbox.detailResolution")}>{resolution}</Row> : null}
              {item.sizeBytes ? <Row label={t("lightbox.detailSize")}>{formatBytes(item.sizeBytes)}</Row> : null}
              {item.durationSeconds ? (
                <Row label={t("lightbox.detailDuration")}>{formatDuration(item.durationSeconds)}</Row>
              ) : null}
              {taken && added ? <Row label={t("lightbox.detailDate")}>{added}</Row> : null}
              {item.location ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityHint={t("lightbox.openMap")}
                  onPress={() =>
                    void Linking.openURL(`https://www.openstreetmap.org/?mlat=${item.location!.lat}&mlon=${item.location!.lng}#map=15/${item.location!.lat}/${item.location!.lng}`)
                  }
                >
                  <Row label={t("lightbox.detailLocation")}>
                    {`${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)}`}
                  </Row>
                </Pressable>
              ) : null}
            </View>
            <Details item={item} active={active} onSelectSimilar={onSelectSimilar} />
          </Animated.View>
          {/* Scroll position hint while the content is scrolled. */}
          <Animated.View pointerEvents="none" className="absolute right-1.5 top-0 w-1 rounded-full bg-foreground" style={thumbStyle} />
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

/** AI + organization sections (keyed by photo so chips fade in per photo). */
function Details({
  item,
  active,
  onSelectSimilar,
}: {
  item: MediaListItem;
  active: boolean;
  onSelectSimilar: (item: MediaListItem) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const details = useMediaDetails(item, active);
  const { describe } = useTagCatalog(active && details.photo);
  const mediaLabels = useMediaLabels(active ? item.id : undefined);
  const { labels } = useLabels(active);

  // AI tags: fallback to the item's `aiTags` (shared-album photos → API returns []).
  const rows: MediaTag[] =
    details.tags.length > 0 ? details.tags : (item.aiTags ?? []).map((tag) => ({ tag, confidence: 1, threshold: 0 }));
  const showPct = details.tags.length > 0;
  const known = rows.filter((r) => describe(r.tag));
  const strong = known.filter((r) => r.confidence >= r.threshold).sort((a, b) => b.confidence - a.confidence);
  const weak = known
    .filter((r) => r.confidence < r.threshold)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_WEAK);
  const tagGroups = [
    strong.filter((r) => !isLabelTag(r.tag)),
    strong.filter((r) => isLabelTag(r.tag)),
  ].filter((g) => g.length);

  const myLabels = labels.filter((l) => mediaLabels.data?.labelIds.includes(l.id));
  const thumb = (width - 24 - 40 - 8 * (SIMILAR_COLUMNS - 1)) / SIMILAR_COLUMNS;

  return (
    <Animated.View key={item.id} entering={fadeIn}>
      {tagGroups.length || weak.length ? (
        <Section icon={Sparkles} title={t("lightbox.detailTags")}>
          {tagGroups.map((group, gi) => (
            <View key={gi} className="flex-row flex-wrap gap-1.5">
              {group.map((r) => {
                const d = describe(r.tag)!;
                return (
                  <Chip key={r.tag} tone={TAG_CHIP[tagColor(r.tag, d.label?.section)]} icon={d.icon} strong={gi === 0}>
                    {d.name}
                    {showPct ? <Text className="text-[13px] opacity-60"> {Math.round(r.confidence * 100)}%</Text> : null}
                  </Chip>
                );
              })}
            </View>
          ))}
          {weak.length ? (
            <View className="flex-row flex-wrap gap-1.5">
              {weak.map((r) => {
                const d = describe(r.tag)!;
                return (
                  <Chip key={r.tag} icon={d.icon} weak>
                    {d.name} {Math.round(r.confidence * 100)}%
                  </Chip>
                );
              })}
            </View>
          ) : null}
        </Section>
      ) : null}

      {details.objects.length ? (
        <Section icon={ScanSearch} title={t("lightbox.detailObjects")}>
          <View className="flex-row flex-wrap gap-1.5">
            {details.objects.map(([name, o]) => {
              const searchable = o.confidence >= YOLO_SEARCH_MIN_CONF;
              return (
                <Chip key={name} tone={searchable ? AI_CHIP.yolo : undefined} weak={!searchable}>
                  {name}
                  {o.count > 1 ? ` ×${o.count}` : ""} {Math.round(o.confidence * 100)}%
                </Chip>
              );
            })}
          </View>
          {details.objects.some(([, o]) => o.confidence < YOLO_SEARCH_MIN_CONF) ? (
            <Text className="text-[13px] text-muted-foreground">
              {t("lightbox.lowConfidenceNote", { pct: YOLO_SEARCH_MIN_CONF * 100 })}
            </Text>
          ) : null}
        </Section>
      ) : null}

      {myLabels.length ? (
        <Section icon={Tag} title={t("favorites.labels.title")}>
          <View className="flex-row flex-wrap gap-1.5">
            {myLabels.map((label) => (
              <View key={label.id} className="flex-row items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1">
                <View className={cn("size-2.5 rounded-full", LABEL_DOT[label.color] ?? LABEL_DOT.slate)} />
                <Text className="text-[14px]">{label.name}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {details.albums.length ? (
        <Section icon={FolderOpen} title={t("albums.inAlbums")}>
          <View className="flex-row flex-wrap gap-1.5">
            {details.albums.map((album) => (
              <View key={album.id} className="flex-row items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1">
                <Icon as={Images} size={13} className="text-muted-foreground" />
                <Text className="text-[14px]">{album.name}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {details.photo ? (
        <Section
          icon={Images}
          title={t("lightbox.similar")}
          badge={
            details.similar?.source ? (
              <View className={cn("rounded-full px-2 py-0.5", AI_CHIP[details.similar.source === "dinov3" ? "dino" : "clip"].box)}>
                <Text className={cn("text-[11px] font-semibold", AI_CHIP[details.similar.source === "dinov3" ? "dino" : "clip"].text)}>
                  {details.similar.source === "dinov3" ? "DINOv3" : "CLIP"}
                </Text>
              </View>
            ) : null
          }
        >
          {details.similarLoading ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text className="text-[14px] text-muted-foreground">{t("lightbox.similarLoading")}</Text>
            </View>
          ) : !details.similar?.items.length ? (
            <Text className="text-[14px] text-muted-foreground">{t("lightbox.similarEmpty")}</Text>
          ) : (
            // A grid, not a horizontal strip: a sideways drag would fight the page swipe.
            <View className="flex-row flex-wrap gap-2">
              {details.similar.items.map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={m.title ?? t("lightbox.photo")}
                  onPress={() => onSelectSimilar(m)}
                  className="overflow-hidden rounded-xl bg-foreground/10 active:opacity-70"
                  style={{ width: thumb, height: thumb }}
                >
                  <Image
                    source={{ uri: m.thumbnailUrlLarge ?? m.thumbnailUrl }}
                    recyclingKey={m.id}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                    style={{ width: "100%", height: "100%" }}
                  />
                  {m.score != null ? (
                    <View className="absolute bottom-1 right-1 rounded bg-black/60 px-1">
                      <Text className="text-[10px] text-white">{Math.round(m.score * 100)}%</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </Section>
      ) : null}
    </Animated.View>
  );
}

function Section({
  icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="mt-5 gap-2.5 border-t border-foreground/10 pt-4">
      <View className="flex-row items-center gap-1.5">
        <Icon as={icon} size={14} className="text-muted-foreground" />
        <Text className="flex-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text>
        {badge}
      </View>
      {children}
    </View>
  );
}

/** AI chip: `tone` = color classes (tag group / YOLO), or dashed + muted when weak / no tone. */
function Chip({
  tone,
  icon,
  strong,
  weak,
  children,
}: {
  tone?: { box: string; text: string };
  icon?: LucideIcon;
  strong?: boolean;
  weak?: boolean;
  children: ReactNode;
}) {
  const colors = tone && !weak ? tone : null;
  return (
    <View
      className={cn(
        "flex-row items-center gap-1 rounded-full px-2.5 py-1",
        colors ? colors.box : "border border-dashed border-foreground/20",
      )}
    >
      {icon ? <Icon as={icon} size={13} className={cn(colors ? colors.text : "text-muted-foreground", "opacity-80")} /> : null}
      <Text className={cn("text-[14px]", colors ? colors.text : "text-muted-foreground", strong && "font-medium")}>
        {children}
      </Text>
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-[15px] text-muted-foreground">{label}</Text>
      <Text numberOfLines={1} className="shrink text-right text-[15px] font-medium">
        {children}
      </Text>
    </View>
  );
}
