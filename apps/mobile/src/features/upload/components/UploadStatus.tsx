import { Image } from "expo-image";
import { usePathname } from "expo-router";
import { CircleAlert, CircleCheck, RotateCw, Upload, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { tabBarSpace } from "@/features/navigation/layout";
import { useLayout } from "@/hooks/useLayout";
import { useTheme } from "@/hooks/useTheme";
import { SLIDE_TIMING } from "@/lib/motion";

import { useUploadQueue } from "../useUploadQueue";

/**
 * Floating glass pill above the BottomBar while files upload (every tab except
 * Camera, which shows its own capture status): preview of the current file ·
 * "Uploading 3/10" + overall progress bar · retry / dismiss when done or failed.
 */
export function UploadStatus() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { formWidth } = useLayout();
  const pathname = usePathname();
  const items = useUploadQueue((s) => s.items);
  const retryFailed = useUploadQueue((s) => s.retryFailed);
  const dismiss = useUploadQueue((s) => s.dismiss);

  const total = items.length;
  const done = items.filter((it) => it.status === "done").length;
  const failed = items.filter((it) => it.status === "error").length;
  const active = items.find((it) => it.status === "uploading");
  const busy = items.some((it) => it.status === "uploading" || it.status === "queued");
  // Overall progress: finished files + partial progress of the running ones.
  const progress = total
    ? (done + items.filter((it) => it.status === "uploading").reduce((sum, it) => sum + it.progress / 100, 0)) / total
    : 0;

  const barStyle = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(progress * 100)}%`, SLIDE_TIMING) }));

  if (!total || pathname === "/camera") return null;

  const preview = (active ?? items.findLast((it) => it.preview))?.preview;
  const title = busy
    ? t("upload.progress", { done, total })
    : failed
      ? t("upload.failed", { count: failed })
      : t("upload.done", { count: done });

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: tabBarSpace(insets.bottom) + 10 }}
    >
      <View style={{ width: Math.min(formWidth, 360) }}>
        <GlassPanel radius={22} padding={8} materialize>
          <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
            <View className="size-10 items-center justify-center overflow-hidden rounded-xl bg-foreground/10">
              {preview ? (
                <Image source={{ uri: preview }} contentFit="cover" style={{ width: 40, height: 40 }} />
              ) : (
                <Icon as={Upload} size={18} className="text-foreground" />
              )}
            </View>
            <View className="flex-1 gap-1.5">
              <View className="flex-row items-center gap-1.5">
                {busy ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <Icon
                    as={failed ? CircleAlert : CircleCheck}
                    size={16}
                    className={failed ? "text-destructive" : "text-foreground"}
                  />
                )}
                <Text numberOfLines={1} className="flex-1 text-[15px] font-medium">
                  {title}
                </Text>
              </View>
              <View className="h-1 overflow-hidden rounded-full bg-foreground/10">
                <Animated.View className={failed && !busy ? "h-full bg-destructive" : "h-full bg-foreground"} style={barStyle} />
              </View>
            </View>
            {!busy && failed ? (
              <PillButton icon={RotateCw} label={t("upload.retry")} onPress={retryFailed} />
            ) : null}
            {!busy ? <PillButton icon={X} label={t("common.close")} onPress={dismiss} /> : null}
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

function PillButton({ icon, label, onPress }: { icon: typeof X; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      className="size-9 items-center justify-center rounded-full active:bg-foreground/10"
    >
      <Icon as={icon} size={18} className="text-foreground" />
    </Pressable>
  );
}
