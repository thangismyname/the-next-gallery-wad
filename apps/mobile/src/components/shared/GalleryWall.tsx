import { tagColor } from "@tng/shared";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";
import { AI_CHIP, TAG_CHIP } from "@/lib/aiColors";
import { cn } from "@/lib/utils";

const GAP = 10;
/** Tile heights as multiples of the column width (a varied "photo wall"). */
const HEIGHTS = [1.3, 0.9, 1.15, 0.75, 1.4, 1, 0.85, 1.2];
/** Drift speed in pt/s — slow enough to read as ambient, not as motion. */
const SPEED = 9;
/** Neutral tile tones — same monochrome surfaces as the gallery grid (theme tokens, no hex). */
const TONES = ["bg-foreground/10", "bg-muted", "bg-foreground/15", "bg-foreground/5", "bg-foreground/20", "bg-muted"];

/**
 * What the app "sees" in a photo — the AI signature drawn on some tiles, with the
 * same colors as the real UI: content tag colored by its group (`tagColor` → `TAG_CHIP`),
 * YOLO26 box (emerald), CLIP match (sky). The rest stay plain, like photos still loading.
 */
type Mark =
  | { kind: "tag"; tag: string; conf: number }
  | { kind: "yolo"; label: string; conf: number; box: [number, number, number, number] }
  | { kind: "clip"; conf: number }
  | null;
const MARKS: Mark[] = [
  { kind: "tag", tag: "beach", conf: 94 },
  null,
  { kind: "yolo", label: "person", conf: 96, box: [0.18, 0.2, 0.82, 0.92] },
  { kind: "tag", tag: "food", conf: 91 },
  null,
  { kind: "clip", conf: 88 },
  { kind: "tag", tag: "pets", conf: 97 },
  null,
  { kind: "yolo", label: "dog", conf: 93, box: [0.12, 0.35, 0.7, 0.9] },
  { kind: "tag", tag: "sunset", conf: 89 },
  null,
  { kind: "tag", tag: "mountain", conf: 92 },
  { kind: "yolo", label: "car", conf: 97, box: [0.08, 0.42, 0.92, 0.78] },
  null,
  { kind: "tag", tag: "night", conf: 86 },
  { kind: "clip", conf: 94 },
  { kind: "tag", tag: "street", conf: 97 },
  null,
  { kind: "tag", tag: "portrait", conf: 92 },
  { kind: "tag", tag: "architecture", conf: 90 },
];

function TileMark({ mark }: { mark: Mark }) {
  const { t } = useTranslation();
  if (!mark) return null;
  if (mark.kind === "yolo") {
    const [x1, y1, x2, y2] = mark.box;
    return (
      <View
        className="absolute rounded-md border-2 border-emerald-400/90"
        style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
      >
        <View className="absolute -top-[18px] -left-0.5 rounded-t-md bg-emerald-400 px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-black">
            {mark.label} {mark.conf}%
          </Text>
        </View>
      </View>
    );
  }
  const chip = mark.kind === "clip" ? AI_CHIP.clip : TAG_CHIP[tagColor(mark.tag)];
  const label = mark.kind === "clip" ? `CLIP · ${mark.conf}%` : `${t(`studio.tags.${mark.tag}`)} · ${mark.conf}%`;
  return (
    <View className={cn("absolute bottom-2 left-2 rounded-full px-2 py-0.5", chip.box)}>
      <Text numberOfLines={1} className={cn("text-[11px] font-medium", chip.text)}>
        {label}
      </Text>
    </View>
  );
}

function Column({ index, colWidth }: { index: number; colWidth: number }) {
  const reduce = useReducedMotion();
  // Each column starts at a different point of the pattern and drifts the other way to its neighbours.
  const tiles = HEIGHTS.map((h, i) => ({
    height: HEIGHTS[(i + index * 3) % HEIGHTS.length] * colWidth,
    tone: TONES[(i + index * 5) % TONES.length],
    mark: MARKS[(i * 3 + index * 7) % MARKS.length],
    key: `${index}-${i}-${h}`,
  }));
  const cycle = tiles.reduce((sum, t) => sum + t.height + GAP, 0);
  const up = index % 2 === 0;

  const offset = useSharedValue(up ? 0 : -cycle);
  useEffect(() => {
    if (reduce) return;
    offset.set(
      withRepeat(withTiming(up ? -cycle : 0, { duration: (cycle / SPEED) * 1000, easing: Easing.linear }), -1, false),
    );
  }, [reduce, offset, up, cycle]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() - colWidth * 0.4 * index }] }));

  // Pattern three times → seamless loop that still covers tall screens (iPad portrait).
  return (
    <Animated.View style={[{ width: colWidth, gap: GAP }, style]}>
      {[...tiles, ...tiles, ...tiles].map((tile, i) => (
        <View key={`${tile.key}-${i}`} className={cn("overflow-hidden", tile.tone)} style={{ height: tile.height, borderRadius: 18 }}>
          <TileMark mark={tile.mark} />
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * Ambient "gallery wall" — the app's visual signature: columns of neutral tiles (the
 * gallery's monochrome surfaces) drifting slowly up / down (static with Reduce Motion),
 * some carrying the AI marks — content-tag chips in their group color, YOLO26 boxes,
 * CLIP matches. Fills its parent (absolute): behind the auth glass card (gives the
 * Liquid Glass something to refract) and as the Welcome hero / closing visual.
 * `width` = width of the box it fills (default: the window); column count follows it.
 */
export function GalleryWall({ width: boxWidth, scrim = true }: { width?: number; scrim?: boolean }) {
  const { width: windowWidth } = useLayout();
  const width = boxWidth ?? windowWidth;
  const columns = Math.max(3, Math.round(width / 150));
  const colWidth = (width - GAP * (columns + 1)) / columns;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} className="overflow-hidden bg-background">
      <View className="flex-row" style={{ gap: GAP, paddingHorizontal: GAP }}>
        {Array.from({ length: columns }, (_, i) => (
          <Column key={i} index={i} colWidth={colWidth} />
        ))}
      </View>
      {/* Soft scrim so the wall stays in the background. */}
      {scrim ? <View style={StyleSheet.absoluteFill} className="bg-background/35" /> : null}
    </View>
  );
}
