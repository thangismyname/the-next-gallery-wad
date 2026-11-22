import {
  DEFAULT_FRAMING,
  framingOrNull,
  MOMENT_ASPECT,
  panFraming,
  zoomFraming,
  type MomentFraming,
} from "@tng/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { RotateCcw, Send, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated, { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { galleryKeys } from "@/features/gallery/useGalleryMedia";
import { Framed } from "@/features/moments/components/Framed";
import { describeFile } from "@/features/upload/useUploadQueue";
import { fadeIn, fadeOut } from "@/lib/motion";
import { momentsApi } from "@/services";
import { uploadMediaFiles } from "@/services/upload";

import type { MomentDraft } from "../useCameraCapture";

/** Same limit as the backend (`createMomentSchema.caption`). */
const CAPTION_MAX = 280;

/**
 * Review a moment before it goes to friends (web Camera "Post to Moments"):
 * 3:4 preview = the feed card (photo, or the looping ≤ 5 s video) — drag to choose what shows,
 * pinch to zoom (saved as the moment's `framing` on Post) + optional caption ·
 * Retake / Post. Post = upload to the library, then create the moment (circle);
 * if only the second step fails, retrying reuses the uploaded file.
 */
export function MomentReview({
  draft,
  onClose,
  onPosted,
}: {
  draft: MomentDraft;
  onClose: () => void;
  onPosted: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(draft.mediaId ?? null);
  const [framing, setFraming] = useState<MomentFraming>(DEFAULT_FRAMING);
  const [media, setMedia] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const start = useSharedValue(DEFAULT_FRAMING);

  // Drag = pan, pinch = zoom (both from the framing at gesture start; same maths as the web framer).
  const gestures = Gesture.Simultaneous(
    Gesture.Pan()
      .runOnJS(true)
      .onStart(() => start.set(framing))
      .onUpdate((e) => {
        if (!media || !frame) return;
        setFraming((f) => ({
          ...panFraming(start.get(), e.translationX, e.translationY, {
            frameW: frame.width,
            frameH: frame.height,
            imgW: media.width,
            imgH: media.height,
          }),
          zoom: f.zoom,
        }));
      }),
    Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => start.set(framing))
      .onUpdate((e) => setFraming((f) => ({ ...f, zoom: zoomFraming(start.get(), start.get().zoom * e.scale).zoom }))),
  );

  const post = async () => {
    if (posting) return;
    setPosting(true);
    setError(null);
    try {
      let id = mediaId;
      if (!id) {
        const { name, type } = describeFile(draft.uri, { video: draft.video });
        const res = await uploadMediaFiles([{ uri: draft.uri, name, type }]);
        id = res?.uploaded?.[0]?.id ?? null;
        if (!id) throw new Error("upload");
        setMediaId(id);
        void queryClient.invalidateQueries({ queryKey: galleryKeys.all });
      }
      await momentsApi.createMoment({
        mediaId: id,
        framings: [framingOrNull(framing)],
        caption: caption.trim() || undefined,
        visibility: "circle",
      });
      void queryClient.invalidateQueries({ queryKey: ["moments"] });
      onPosted();
    } catch {
      setError(t(mediaId ? "camera.momentFailed" : "camera.saveFailed"));
      setPosting(false);
    }
  };

  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} className="absolute inset-0 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center gap-5 px-4"
        style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
      >
        <GestureDetector gesture={gestures}>
          <View
            className="w-full self-center overflow-hidden rounded-[36px] bg-white/5"
            style={{ maxWidth: 520, aspectRatio: 1 / MOMENT_ASPECT }}
            onLayout={(e) => setFrame(e.nativeEvent.layout)}
          >
            <Framed framing={framing} media={media}>
              {draft.video ? (
                <LoopVideo uri={draft.uri} onSize={setMedia} />
              ) : (
                <Image
                  source={{ uri: draft.uri }}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                  onLoad={(e) => setMedia({ width: e.source.width, height: e.source.height })}
                />
              )}
            </Framed>
            {framingOrNull(framing) ? (
              <View className="absolute right-3 top-3">
                <GlassButton size={36} accessibilityLabel={t("moments.framer.reset")} onPress={() => setFraming(DEFAULT_FRAMING)}>
                  <Icon as={RotateCcw} size={16} />
                </GlassButton>
              </View>
            ) : null}
          </View>
        </GestureDetector>
        <Text className="text-center text-[12px] text-white/60">{t("moments.framer.hintMobile")}</Text>

        <View className="w-full flex-row items-center self-center rounded-full bg-white/12 px-4" style={{ maxWidth: 520 }}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={CAPTION_MAX}
            placeholder={t("camera.captionPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.5)"
            editable={!posting}
            returnKeyType="send"
            onSubmitEditing={() => void post()}
            className="h-12 flex-1 font-sans text-[16px] text-white"
          />
        </View>

        {error ? <Text className="text-center text-[14px] text-red-300">{error}</Text> : null}

        <View className="flex-row items-center justify-center gap-6">
          <GlassButton size={56} accessibilityLabel={t("camera.retake")} disabled={posting} onPress={onClose}>
            <Icon as={X} size={24} />
          </GlassButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("camera.saveMoment")}
            disabled={posting}
            onPress={() => void post()}
            className="h-14 flex-row items-center gap-2 rounded-full bg-rose-400 px-7 active:opacity-80"
          >
            {posting ? <ActivityIndicator color="black" /> : <Icon as={Send} size={20} className="text-black" />}
            <Text className="text-[16px] font-semibold text-black">
              {posting ? t("camera.posting") : t("camera.saveMoment")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function LoopVideo({ uri, onSize }: { uri: string; onSize: (size: { width: number; height: number }) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  // Video size (for the framing maths) arrives with its track.
  const { videoTrack } = useEvent(player, "videoTrackChange", { videoTrack: player.videoTrack });
  const size = videoTrack?.size;
  useEffect(() => {
    if (size?.width && size.height) onSize({ width: size.width, height: size.height });
  }, [size?.width, size?.height, onSize]);
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} />;
}
