import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Send, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { galleryKeys } from "@/features/gallery/useGalleryMedia";
import { describeFile } from "@/features/upload/useUploadQueue";
import { fadeIn, fadeOut } from "@/lib/motion";
import { momentsApi } from "@/services";
import { uploadMediaFiles } from "@/services/upload";

import type { MomentDraft } from "../useCameraCapture";

/** Same limit as the backend (`createMomentSchema.caption`). */
const CAPTION_MAX = 280;

/**
 * Review a moment before it goes to friends (web Camera "Post to Moments"):
 * square preview (photo, or the looping ≤ 5 s video) + optional caption ·
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
  const [mediaId, setMediaId] = useState<string | null>(null);

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
      await momentsApi.createMoment({ mediaId: id, caption: caption.trim() || undefined, visibility: "circle" });
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
        <View className="aspect-square w-full self-center overflow-hidden rounded-[36px] bg-white/5" style={{ maxWidth: 520 }}>
          {draft.video ? <LoopVideo uri={draft.uri} /> : (
            <Image source={{ uri: draft.uri }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
          )}
        </View>

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

function LoopVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ width: "100%", height: "100%" }} />;
}
