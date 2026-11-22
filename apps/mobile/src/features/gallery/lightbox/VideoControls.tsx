import { VIDEO_SPEEDS, formatDuration } from "@tng/shared";
import { useEvent } from "expo";
import type { VideoPlayer } from "expo-video";
import { Maximize, Pause, Play, Volume1, Volume2, VolumeX, type LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

import { useVideoPlayerStore } from "./videoPlayerStore";

/**
 * Điều khiển của video đang mở (thay điều khiển gốc → chỉ 1 nút âm lượng, web `LightboxVideo`):
 * tua · phát / dừng · thời gian · tốc độ 0.5× · 1× · 2× · tắt tiếng + âm lượng · toàn màn hình (=
 * trình phát mặc định của iOS / Android với điều khiển gốc; thoát ra → về thanh này).
 * Vẽ ở cấp màn hình ngay trên thanh công cụ (không nằm trong trang → zoom video không phóng to nó,
 * video vẫn phủ đủ khung), ẩn / hiện cùng các thanh của trình xem (chạm vào video). Player lấy
 * từ `videoPlayerStore` (gắn bởi `LightboxPage`).
 */
export function VideoControls({ visible }: { visible: boolean }) {
  const player = useVideoPlayerStore((s) => s.player);
  const nativeUi = useVideoPlayerStore((s) => s.nativeUi);
  if (!player || !visible || nativeUi) return null;
  return <Controls player={player} />;
}

function Controls({ player }: { player: VideoPlayer }) {
  const { t } = useTranslation();
  const { volume, muted, rate, set, openNative } = useVideoPlayerStore();
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const duration = player.duration || 0;
  useEffect(() => setTickInterval(player), [player]);

  const silent = muted || volume === 0;
  const toggle = () => {
    if (player.playing) player.pause();
    else player.play();
  };

  return (
    <View className="w-full max-w-[560px] gap-1.5 rounded-3xl bg-black/60 px-3 pb-2 pt-2">
          <Track
            label={t("lightbox.player.seek")}
            value={duration ? currentTime / duration : 0}
            onChange={(f) => {
              seek(player, f * duration);
            }}
          />
          <View className="flex-row items-center gap-2">
            <TapButton label={t(isPlaying ? "lightbox.player.pause" : "lightbox.player.play")} onPress={toggle}>
              <Icon as={isPlaying ? Pause : Play} size={20} className="text-white" />
            </TapButton>
            <Text className="text-[12px] text-white/90">
              {formatDuration(currentTime) || "0:00"} / {formatDuration(duration) || "0:00"}
            </Text>
            <View className="flex-1" />
            {VIDEO_SPEEDS.map((r) => (
              <TapButton
                key={r}
                label={`${t("lightbox.player.speed")} ${r}×`}
                onPress={() => {
                  set({ rate: r });
                }}
              >
                <View className={`rounded-full px-2 py-0.5 ${rate === r ? "bg-white" : ""}`}>
                  <Text className={`text-[12px] font-medium ${rate === r ? "text-black" : "text-white"}`}>{r}×</Text>
                </View>
              </TapButton>
            ))}
          </View>
          <View className="flex-row items-center gap-2">
            <TapButton
              label={t(silent ? "lightbox.player.unmute" : "lightbox.player.mute")}
              // Bật lại tiếng ở âm lượng cũ (đang 0 thì 50 %).
              onPress={() => {
                if (silent) set({ muted: false, volume: volume || 0.5 });
                else set({ muted: true });
              }}
            >
              <Icon as={(silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2) as LucideIcon} size={20} className="text-white" />
            </TapButton>
            <View className="flex-1">
              <Track
                label={t("lightbox.player.volume")}
                value={silent ? 0 : volume}
                onChange={(f) => {
                  set({ volume: f, muted: f <= 0 });
                }}
              />
            </View>
            <TapButton label={t("lightbox.player.fullscreen")} onPress={openNative}>
              <Icon as={Maximize} size={18} className="text-white" />
            </TapButton>
          </View>
    </View>
  );
}

// expo-video chỉ mở thuộc tính trên object player — gán qua hàm ngoài component (React Compiler).
function setTickInterval(player: VideoPlayer) {
  player.timeUpdateEventInterval = 0.25;
}
function seek(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

/** Nút = RNGH Tap (thắng cử chỉ của trình xem). */
function TapButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const tap = Gesture.Tap().runOnJS(true).onEnd((_e, ok) => ok && onPress());
  return (
    <GestureDetector gesture={tap}>
      <View accessible accessibilityRole="button" accessibilityLabel={label} onAccessibilityTap={onPress} hitSlop={6} className="min-h-8 items-center justify-center px-1">
        {children}
      </View>
    </GestureDetector>
  );
}

/** Thanh kéo 0–1 (tua / âm lượng): chạm / kéo = đặt giá trị; Pan bắt ngay khi chạm → trình xem không vuốt. */
function Track({ label, value, onChange }: { label: string; value: number; onChange: (fraction: number) => void }) {
  const [width, setWidth] = useState(1);
  const at = (x: number) => onChange(Math.min(1, Math.max(0, x / width)));
  const pan = Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => at(e.x)).onUpdate((e) => at(e.x));
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === "increment" ? 0.1 : -0.1))))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
        className="h-6 justify-center"
      >
        <View className="h-1 overflow-hidden rounded-full bg-white/30">
          <View className="h-full bg-white" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
        </View>
      </View>
    </GestureDetector>
  );
}
