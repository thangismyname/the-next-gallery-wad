import { formatDuration, type MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import { Check, Heart, Play } from "lucide-react-native";
import { memo, useCallback, useRef, type ComponentRef } from "react";
import { Pressable, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { HEADER_COLLAPSE_DISTANCE } from "@/features/navigation/layout";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import type { Rect } from "../lightbox/geometry";

/** Corner radius of the grid's top edge (first row's outer tiles). */
export const GRID_RADIUS = 24;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Native view instance (RN 0.88: refs are element instances, not the `View` class). */
export type TileNode = ComponentRef<typeof View>;

/**
 * One square grid cell. Uses the `med` (400px) thumbnail — `small` (200px) is
 * blurry on a 3-column retina grid. `recyclingKey` lets expo-image drop the old
 * picture immediately when FlashList recycles the cell. Badges sit on the photo,
 * so they stay dark-on-image (like the web thumbnails).
 *
 * `onPress` gets the tile's on-screen rect (the Lightbox flies from it);
 * `registerTile` lets the gallery find a tile again (Lightbox close, drag-select).
 * `selected` is undefined outside selection mode; in it, a check circle shows
 * (filled when selected, the photo dimmed + inset).
 */
export const MediaTile = memo(function MediaTile({
  item,
  size,
  onPress,
  registerTile,
  selected,
  roundTop,
  dots,
}: {
  item: MediaListItem;
  size: number;
  onPress?: (item: MediaListItem, rect: Rect) => void;
  registerTile?: (id: string, node: TileNode | null) => void;
  selected?: boolean;
  /**
   * Rounded top corner(s) — the grid's first row curves down like a sheet. With
   * `scrollY` the corners straighten while scrolling, in step with the header
   * title collapsing to the left.
   */
  roundTop?: { left?: boolean; right?: boolean; scrollY?: SharedValue<number> };
  /**
   * Label color dot classes (Favorites: why the photo is there). Shown with the
   * heart in a small dark pill (on the photo → dark-on-image).
   */
  dots?: string[];
}) {
  const isVideo = item.mediaType === "video";
  const node = useRef<TileNode | null>(null);
  const id = item.id;
  const setRef = useCallback(
    (view: TileNode | null) => {
      node.current = view;
      registerTile?.(id, view);
    },
    [id, registerTile],
  );

  const left = !!roundTop?.left;
  const right = !!roundTop?.right;
  const scrollY = roundTop?.scrollY;
  const cornerStyle = useAnimatedStyle(() => {
    if (!left && !right) return {};
    const r = scrollY
      ? interpolate(scrollY.get(), [0, HEADER_COLLAPSE_DISTANCE], [GRID_RADIUS, 0], Extrapolation.CLAMP)
      : GRID_RADIUS;
    return { borderTopLeftRadius: left ? r : 0, borderTopRightRadius: right ? r : 0 };
  }, [left, right, scrollY]);

  const handlePress = () => {
    node.current?.measureInWindow((x, y, width, height) => onPress?.(item, { x, y, width, height }));
  };

  return (
    <AnimatedPressable
      ref={setRef}
      onPress={onPress ? handlePress : undefined}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.title ?? undefined}
      accessibilityState={selected != null ? { selected } : undefined}
      className="overflow-hidden bg-muted active:opacity-80"
      style={[{ width: size, height: size }, cornerStyle]}
    >
      <Image
        source={{ uri: item.thumbnailUrlLarge ?? item.thumbnailUrl }}
        recyclingKey={item.id}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        style={selected ? { margin: 6, flex: 1, borderRadius: 6 } : { width: "100%", height: "100%" }}
      />
      {isVideo ? (
        <View className="absolute right-1.5 top-1.5 flex-row items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5">
          <Icon as={Play} size={10} className="text-white" fill="currentColor" />
          {item.durationSeconds ? (
            <Text className="text-[11px] font-medium text-white">{formatDuration(item.durationSeconds)}</Text>
          ) : null}
        </View>
      ) : null}
      {item.isFavorite || dots?.length ? (
        <View
          pointerEvents="none"
          className={cn(
            "absolute bottom-1.5 left-1.5 flex-row items-center gap-1",
            dots?.length ? "rounded-full bg-black/45 px-1.5 py-1" : null,
          )}
        >
          {item.isFavorite ? (
            <Icon as={Heart} size={dots?.length ? 11 : 14} className={dots?.length ? "text-rose-500" : "text-white"} fill="currentColor" />
          ) : null}
          {dots?.slice(0, 4).map((dot, i) => (
            <View key={i} className={cn("size-2 rounded-full border border-white/70", dot)} />
          ))}
        </View>
      ) : null}
      {selected != null ? (
        <View
          pointerEvents="none"
          className={cn(
            "absolute left-1.5 top-1.5 size-[22px] items-center justify-center rounded-full border-2 border-white",
            selected ? "bg-primary" : "bg-black/20",
          )}
        >
          {selected ? <Icon as={Check} size={13} strokeWidth={3} className="text-primary-foreground" /> : null}
        </View>
      ) : null}
    </AnimatedPressable>
  );
});
