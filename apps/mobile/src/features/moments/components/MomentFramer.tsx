import {
  DEFAULT_FRAMING,
  MOMENT_ASPECT,
  framingOrNull,
  panFraming,
  resolveMediaUrl,
  zoomFraming,
  type FramerCell,
  type MomentFraming,
} from "@tng/shared";
import { Image } from "expo-image";
import { ArrowDown, ArrowUp, ImagePlus, RotateCcw, UserRound } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

import { Framed } from "./Framed";

/** One of my photos in the editor (video = its poster). */
export type FramerPhoto = { id: string; src: string; width: number; height: number };

type Props = {
  photos: FramerPhoto[];
  /** Frames top → bottom (`FramerCell` from `@tng/shared`). */
  layout: FramerCell[];
  framings: Record<string, MomentFraming>;
  onFrame: (id: string, framing: MomentFraming) => void;
  canPlace: (slot: number) => boolean;
  onMove: (from: number, to: number) => void;
  width: number;
};

/**
 * Mobile version of the web framer: the 3:4 card with the picked photos — tap a frame to select,
 * drag = what shows, pinch = zoom, tap an empty frame = move the selected photo there, ↑ / ↓.
 * Same maths as the card (`Framed` + `@tng/shared` framing helpers); saved only on Post.
 */
export function MomentFramer({ photos, layout, framings, onFrame, canPlace, onMove, width }: Props) {
  const { t } = useTranslation();
  const photoSlots = layout.flatMap((cell, slot) => (typeof cell === "number" && photos[cell] ? [slot] : []));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const current = activeSlot !== null && photoSlots.includes(activeSlot) ? activeSlot : (photoSlots[0] ?? null);
  const currentCell = current === null ? null : layout[current];
  const photo = typeof currentCell === "number" ? photos[currentCell] : undefined;
  const multiSlot = layout.length > 1;

  const move = (to: number) => {
    if (current === null || to < 0 || to >= layout.length || !canPlace(to)) return;
    onMove(current, to);
    setActiveSlot(to);
  };

  if (!photo || current === null) return null;
  return (
    <View className="items-center gap-3">
      <View className="overflow-hidden rounded-[28px] bg-black" style={{ width, height: width * MOMENT_ASPECT, gap: 2 }}>
        {layout.map((cell, slot) => (
          <View key={slot} className="flex-1 overflow-hidden">
            {typeof cell === "number" && photos[cell] ? (
              <FrameSlot
                photo={photos[cell]}
                framing={framings[photos[cell].id] ?? DEFAULT_FRAMING}
                active={multiSlot && slot === current}
                onSelect={() => setActiveSlot(slot)}
                onFrame={(f) => onFrame(photos[cell].id, f)}
              />
            ) : cell && typeof cell === "object" ? (
              <View style={[StyleSheet.absoluteFill, { opacity: 0.7 }]}>
                <Framed framing={cell.framing}>
                  <Image source={{ uri: resolveMediaUrl(cell.src) }} contentFit="cover" style={StyleSheet.absoluteFill} />
                </Framed>
              </View>
            ) : canPlace(slot) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("moments.framer.placeHere")}
                onPress={() => move(slot)}
                className="flex-1 items-center justify-center gap-1 border border-dashed border-white/25 bg-white/5"
              >
                <Icon as={UserRound} size={16} className="text-white/60" />
                <Text className="text-[12px] text-white/60">{t("moments.framer.friendSlot")}</Text>
                <View className="flex-row items-center gap-1">
                  <Icon as={ImagePlus} size={12} className="text-white/70" />
                  <Text className="text-[11px] text-white/70">{t("moments.framer.placeHere")}</Text>
                </View>
              </Pressable>
            ) : (
              <View className="flex-1 items-center justify-center gap-1 bg-white/5">
                <Icon as={UserRound} size={16} className="text-white/60" />
                <Text className="text-[12px] text-white/60">{t("moments.framer.friendSlot")}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <Text className="text-center text-[12px] text-muted-foreground">{t("moments.framer.hintMobile")}</Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {multiSlot ? (
          <>
            <Button size="sm" variant="outline" disabled={!canPlace(current - 1)} onPress={() => move(current - 1)}>
              <Icon as={ArrowUp} size={14} />
              <Text>{t("moments.framer.moveUp")}</Text>
            </Button>
            <Button size="sm" variant="outline" disabled={!canPlace(current + 1)} onPress={() => move(current + 1)}>
              <Icon as={ArrowDown} size={14} />
              <Text>{t("moments.framer.moveDown")}</Text>
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={!framingOrNull(framings[photo.id])}
          onPress={() => onFrame(photo.id, DEFAULT_FRAMING)}
        >
          <Icon as={RotateCcw} size={14} />
          <Text>{t("moments.framer.reset")}</Text>
        </Button>
      </View>
    </View>
  );
}

function FrameSlot({
  photo,
  framing,
  active,
  onSelect,
  onFrame,
}: {
  photo: FramerPhoto;
  framing: MomentFraming;
  active: boolean;
  onSelect: () => void;
  onFrame: (f: MomentFraming) => void;
}) {
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const start = useSharedValue(DEFAULT_FRAMING);
  const media = { width: photo.width, height: photo.height };

  const gestures = Gesture.Simultaneous(
    Gesture.Tap().runOnJS(true).onEnd(onSelect),
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(4)
      .onStart(() => {
        onSelect();
        start.set(framing);
      })
      .onUpdate((e) => {
        if (!frame) return;
        onFrame(
          panFraming(start.get(), e.translationX, e.translationY, {
            frameW: frame.width,
            frameH: frame.height,
            imgW: media.width,
            imgH: media.height,
          }),
        );
      }),
    Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        onSelect();
        start.set(framing);
      })
      .onUpdate((e) => onFrame(zoomFraming({ ...framing, zoom: start.get().zoom }, start.get().zoom * e.scale))),
  );

  return (
    <GestureDetector gesture={gestures}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => setFrame(e.nativeEvent.layout)}>
        <Framed framing={framing} media={media}>
          <Image source={{ uri: resolveMediaUrl(photo.src) }} contentFit="cover" style={StyleSheet.absoluteFill} />
        </Framed>
        {active ? <View pointerEvents="none" className="absolute inset-0 border-2 border-primary" /> : null}
      </View>
    </GestureDetector>
  );
}
