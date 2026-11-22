import { resolveMediaUrl, type Moment, type MomentFraming, type MomentSlot } from "@tng/shared";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { ImageOff, Volume2, VolumeX } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

import { PersonAvatar } from "@/components/shared/PersonAvatar";

import { Framed } from "./Framed";

/**
 * Picture of a moment (web `TemplateMedia`): single = one photo / video filling
 * the square; duo / trio = slots stacked vertically (½ / ⅓ height, 2px line), each
 * with its author's avatar at the **middle of its left edge** (never in a rounded
 * corner of the card). Videos play muted + looped only while `active`; the small
 * speaker button toggles sound (the rest of the picture is the card's tap area).
 */
export function MomentMedia({ moment, active }: { moment: Moment; active: boolean }) {
  const { t } = useTranslation();
  if (moment.template === "single") {
    if (moment.missingMedia || (!moment.displayUrl && !moment.thumbnailUrl)) return <Missing label={t("moments.mediaDeleted")} />;
    return moment.mediaType === "video" && moment.url ? (
      <MomentVideo url={moment.url} poster={moment.thumbnailUrl} active={active} framing={moment.framing} media={moment} />
    ) : (
      <Photo uri={moment.displayUrl ?? moment.thumbnailUrl} framing={moment.framing} media={moment} />
    );
  }
  const slots = [...moment.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  return (
    <View className="flex-1 gap-0.5 bg-black">
      {slots.map((slot) => (
        <View key={slot.slotIndex} className="flex-1 overflow-hidden">
          <Slot slot={slot} active={active} />
        </View>
      ))}
    </View>
  );
}

function Slot({ slot, active }: { slot: MomentSlot; active: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {slot.missing || !slot.mediaId ? (
        <Missing label={t(slot.missing ? "moments.mediaDeleted" : "moments.noPhoto")} />
      ) : slot.mediaType === "video" && slot.url ? (
        <MomentVideo url={slot.url} poster={slot.thumbnailUrl} active={active} framing={slot.framing} media={slot} />
      ) : (
        <Photo uri={slot.displayUrl ?? slot.thumbnailUrl} framing={slot.framing} media={slot} />
      )}
      <View pointerEvents="none" className="absolute inset-y-0 left-3 justify-center">
        <View className="rounded-full border-2 border-white/90">
          <PersonAvatar name={slot.userName} image={slot.userAvatarUrl} size={28} />
        </View>
      </View>
    </>
  );
}

type Size = { width: number; height: number };

/** Framing = same maths as the web CSS (`Framed` + `@tng/shared` `framingRect`). */
function Photo({ uri, framing, media }: { uri: string | null | undefined; framing?: MomentFraming | null; media?: Size }) {
  if (!uri) return null;
  return (
    <Framed framing={framing} media={media}>
      <Image
        source={{ uri: resolveMediaUrl(uri) }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
      />
    </Framed>
  );
}

function MomentVideo({
  url,
  poster,
  active,
  framing,
  media,
}: {
  url: string;
  poster: string | null;
  active: boolean;
  framing?: MomentFraming | null;
  media?: Size;
}) {
  const { t } = useTranslation();
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(resolveMediaUrl(url), (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  useEffect(() => applyMuted(player, muted), [muted, player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {poster ? <Photo uri={poster} framing={framing} media={media} /> : null}
      <Framed framing={framing} media={media}>
        <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Framed>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(muted ? "moments.unmute" : "moments.mute")}
        hitSlop={10}
        onPress={() => setMuted((m) => !m)}
        className="absolute right-3 top-3 rounded-full bg-black/55 p-2"
      >
        <Icon as={muted ? VolumeX : Volume2} size={16} className="text-white" />
      </Pressable>
    </View>
  );
}

/** expo-video exposes sound only as the `muted` property of the native player object. */
function applyMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

function Missing({ label }: { label: string }) {
  return (
    <View className="absolute inset-0 items-center justify-center gap-1.5 bg-muted">
      <Icon as={ImageOff} size={22} className="text-muted-foreground" />
      <Text className="text-[13px] text-muted-foreground">{label}</Text>
    </View>
  );
}
