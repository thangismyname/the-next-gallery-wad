import { ASPECT_RATIOS, MOMENTS_MAX_DURATION, RATIO_MAP, formatDuration, type AspectRatio } from "@tng/shared";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  CircleAlert,
  Flashlight,
  FlashlightOff,
  Grid3x3,
  SwitchCamera,
  Timer,
  TimerOff,
  Video,
  X,
  Zap,
  ZapOff,
  ZoomIn,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, ZoomIn as ZoomInAnim } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { BOTTOM_BAR_HEIGHT, HEADER_ROW, bottomBarOffset } from "@/features/navigation/layout";
import { useUploadQueue } from "@/features/upload/useUploadQueue";
import { APP_DURATION, EASE_OUT, fadeIn, fadeOut, riseIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { fitFrame, frameToPhotoCrop, type Rect, type Size } from "./cameraFrame";
import { CameraPermission } from "./components/CameraPermission";
import { MomentReview } from "./components/MomentReview";
import { RatioFrame } from "./components/RatioFrame";
import { ShutterButton } from "./components/ShutterButton";
import { useCameraCapture, type CaptureMode, type MomentDraft } from "./useCameraCapture";
import { useCameraPrefs } from "./useCameraPrefs";

/** Pinch sensitivity: zoom (0–1 of the device max) gained per 1× of finger spread. */
const PINCH_GAIN = 0.4;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const countdownIn = ZoomInAnim.duration(APP_DURATION.slow).easing(EASE_OUT);
const MODES: { mode: CaptureMode; label: string }[] = [
  { mode: "picture", label: "camera.photoShort" },
  { mode: "video", label: "camera.videoShort" },
  { mode: "moments", label: "camera.momentsShort" },
];
const FLASH_LABEL = { off: "camera.flashOff", auto: "camera.flashAuto", on: "camera.flashOn", screen: "camera.flash" } as const;

/**
 * Camera tab: full-screen live preview under the glass BottomBar. Modes Photo ·
 * Video · Moment (tap = photo, hold = video ≤ 5 s → review + caption → posted to
 * friends). Flash (photo) or torch (video), grid, self-timer (photo), aspect
 * ratio (photos are cropped to the frame drawn on the preview; videos stay full),
 * flip, pinch to zoom, double-tap to flip. Flash / grid / timer / ratio are
 * remembered (`useCameraPrefs`). Photos and videos go straight to the upload
 * queue; the thumbnail at the left shows the last shot and its upload state (tap
 * → Library). The camera only runs while this tab is focused.
 */
export function CameraScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const { flash, cycleFlash, showGrid, toggleGrid, timer, cycleTimer, ratio, setRatio } = useCameraPrefs();
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [draft, setDraft] = useState<MomentDraft | null>(null);
  const [screen, setScreen] = useState<Size>({ width: 0, height: 0 });
  const [controlsTop, setControlsTop] = useState(0);

  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((v) => (v === text ? null : v)), 2200);
  }, []);
  const showError = useCallback(() => flashNotice(t("camera.captureFailed")), [flashNotice, t]);

  // Frame of the chosen ratio, centered between the top bar and the controls.
  const top = insets.top + HEADER_ROW + 8;
  const frameArea = useMemo<Rect>(
    () => ({ x: 0, y: top, width: screen.width, height: Math.max(0, (controlsTop || screen.height) - 12 - top) }),
    [top, screen, controlsTop],
  );
  const ratioFrame = useMemo(() => fitFrame(frameArea, RATIO_MAP[ratio]), [frameArea, ratio]);

  // Latest frame for the async crop after the shutter (read outside render).
  const cropRef = useRef<{ frame: Rect | null; screen: Size }>({ frame: null, screen });
  useEffect(() => {
    cropRef.current = { frame: ratioFrame, screen };
  }, [ratioFrame, screen]);
  const processPhoto = useCallback(async (photo: { uri: string }) => {
    const { frame, screen: size } = cropRef.current;
    if (!frame || !size.width) return photo.uri;
    // Decode first: the real (EXIF-rotated) pixel size is what the crop maps onto.
    const decoded = await ImageManipulator.manipulate(photo.uri).renderAsync();
    const crop = frameToPhotoCrop(frame, size, { width: decoded.width, height: decoded.height });
    const cropped = await ImageManipulator.manipulate(decoded)
      .crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height })
      .renderAsync();
    const saved = await cropped.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
    return saved.uri;
  }, []);

  const capture = useCameraCapture(camera, {
    onError: showError,
    timer,
    processPhoto,
    onMoment: setDraft,
  });
  const { mode, cancelCountdown, onReady } = capture;

  // `/camera?mode=moments` (Moments tab "Shoot a moment") → switch once, then clear the param.
  const params = useLocalSearchParams<{ mode?: string }>();
  const { setMode } = capture;
  useEffect(() => {
    if (params.mode !== "moments") return;
    void setMode("moments");
    router.setParams({ mode: undefined });
  }, [params.mode, setMode]);
  const video = mode === "video";
  const moment = mode === "moments";
  const counting = capture.countdown > 0;
  const busy = capture.recording || capture.preparing || counting;
  // Videos are never cropped → no frame while filming / in video mode.
  const shownFrame = video || capture.recording || capture.preparing ? null : ratioFrame;

  // Leaving the tab unmounts the camera → wait for onCameraReady again, start at 1×,
  // drop a running countdown (it would fire on a camera that's gone).
  useFocusEffect(
    useCallback(
      () => () => {
        setReady(false);
        setZoom(0);
        setTorch(false);
        setRatioOpen(false);
        cancelCountdown();
      },
      [cancelCountdown],
    ),
  );

  const flip = useCallback(() => {
    if (busy) return;
    void Haptics.selectionAsync();
    setZoom(0);
    setFacing((f) => (f === "back" ? "front" : "back"));
  }, [busy]);

  // Pinch → zoom, double tap → flip (gestures on the preview, under the controls).
  const pinchStart = useSharedValue(0);
  const zoomValue = useSharedValue(0);
  useEffect(() => zoomValue.set(zoom), [zoom, zoomValue]);
  const gestures = Gesture.Simultaneous(
    Gesture.Pinch()
      .onStart(() => pinchStart.set(zoomValue.get()))
      .onUpdate((e) => scheduleOnRN(setZoom, clamp01(pinchStart.get() + (e.scale - 1) * PINCH_GAIN))),
    Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => scheduleOnRN(flip)),
  );

  const lastItem = useUploadQueue((s) => s.items.find((it) => it.id === capture.last?.uploadId));

  const controlsBottom = bottomBarOffset(insets.bottom) + BOTTOM_BAR_HEIGHT + 18;
  const onScreenLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setScreen((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  const onControlsLayout = (e: LayoutChangeEvent) => setControlsTop(e.nativeEvent.layout.y);

  const shutterLabel = counting
    ? "camera.cancelTimer"
    : moment
      ? "camera.momentsMode"
      : video
        ? capture.recording
          ? "camera.stopRecording"
          : "camera.startRecording"
        : "camera.shutter";
  const hint = moment
    ? capture.recording
      ? t("camera.hintMomentsRecording")
      : t("camera.hintMoments")
    : null;

  if (!permission) return <View className="flex-1 bg-black" />;

  return (
    <View className="flex-1 bg-black" onLayout={onScreenLayout}>
      {focused ? <StatusBar style="light" /> : null}

      {!permission.granted ? (
        <CameraPermission canAskAgain={permission.canAskAgain} onRequest={() => void requestPermission()} />
      ) : (
        <>
          {focused ? (
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode={capture.cameraMode}
              flash={video ? "off" : flash}
              enableTorch={video && torch}
              zoom={zoom}
              mute={capture.muted}
              onCameraReady={() => {
                setReady(true);
                onReady();
              }}
              onMountError={showError}
            />
          ) : null}

          {/* Gesture layer over the preview (pinch zoom, double-tap flip) + ratio frame / grid. */}
          <GestureDetector gesture={gestures}>
            <View style={StyleSheet.absoluteFill}>
              <RatioFrame frame={shownFrame} grid={showGrid} />
            </View>
          </GestureDetector>

          {counting ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
              <Animated.Text
                key={capture.countdown}
                entering={countdownIn}
                className="font-heading text-[120px] text-white"
                style={{ textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 24 }}
              >
                {capture.countdown}
              </Animated.Text>
            </View>
          ) : null}

          {/* Top: grid · timer · ratio | recording timer | flash / torch. */}
          <View
            pointerEvents="box-none"
            className="absolute inset-x-0 top-0 flex-row items-center gap-2.5 px-4"
            style={{ paddingTop: insets.top, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, height: insets.top + HEADER_ROW }}
          >
            {capture.recording ? (
              <Animated.View entering={fadeIn} exiting={fadeOut} className="absolute inset-x-0 items-center" style={{ top: insets.top + 10 }} pointerEvents="none">
                <View className="flex-row items-center gap-2 rounded-full bg-red-500 px-3 py-1.5">
                  <View className="size-2 rounded-full bg-white" />
                  <Text className="text-[15px] font-semibold text-white">
                    {formatDuration(capture.seconds)}
                    {moment ? ` / ${formatDuration(MOMENTS_MAX_DURATION)}` : ""}
                  </Text>
                </View>
              </Animated.View>
            ) : null}
            {!busy ? (
              <Animated.View entering={fadeIn} exiting={fadeOut} className="flex-row gap-2.5">
                <GlassButton
                  size={40}
                  accessibilityLabel={t(showGrid ? "camera.gridOff" : "camera.gridOn")}
                  accessibilityState={{ selected: showGrid }}
                  onPress={toggleGrid}
                >
                  <Icon as={Grid3x3} size={19} className={showGrid ? "text-amber-400" : undefined} />
                </GlassButton>
                {mode === "picture" ? (
                  <GlassButton
                    size={40}
                    accessibilityLabel={timer ? t("camera.timerSeconds", { seconds: timer }) : t("camera.timerOff")}
                    onPress={cycleTimer}
                  >
                    <View>
                      <Icon as={timer ? Timer : TimerOff} size={19} className={timer ? "text-amber-400" : undefined} />
                      {timer ? (
                        <Text className="absolute -bottom-1.5 -right-2 text-[10px] font-bold text-amber-400">{timer}</Text>
                      ) : null}
                    </View>
                  </GlassButton>
                ) : null}
                {!video ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("camera.aspectRatio")}
                    accessibilityState={{ expanded: ratioOpen }}
                    onPress={() => setRatioOpen((v) => !v)}
                    hitSlop={6}
                    className={cn(
                      "h-10 min-w-10 items-center justify-center rounded-full px-3",
                      ratioOpen ? "bg-white" : "bg-black/40",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        ratioOpen ? "text-black" : ratio === "free" ? "text-white" : "text-amber-400",
                      )}
                    >
                      {ratio === "free" ? t("camera.ratio.free") : ratio}
                    </Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            ) : null}
            <View className="flex-1" />
            {video ? (
              <GlassButton size={40} accessibilityLabel={t("camera.torch")} accessibilityState={{ selected: torch }} onPress={() => setTorch((v) => !v)}>
                <Icon as={torch ? Flashlight : FlashlightOff} size={19} />
              </GlassButton>
            ) : (
              <GlassButton size={40} accessibilityLabel={t(FLASH_LABEL[flash])} onPress={cycleFlash}>
                <View>
                  <Icon as={flash === "off" ? ZapOff : Zap} size={19} fill={flash === "on" ? "currentColor" : "none"} />
                  {flash === "auto" ? <Text className="absolute -bottom-1.5 -right-2 text-[10px] font-bold">A</Text> : null}
                </View>
              </GlassButton>
            )}
          </View>

          {/* Ratio chips (under the top bar). */}
          {ratioOpen && !video && !busy ? (
            <Animated.View
              entering={riseIn}
              exiting={fadeOut}
              className="absolute inset-x-0 items-center"
              style={{ top: insets.top + HEADER_ROW + 4, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 rounded-full bg-black/60 p-1">
                {ASPECT_RATIOS.map(({ value }) => (
                  <RatioChip
                    key={value}
                    value={value}
                    active={ratio === value}
                    label={value === "free" ? t("camera.ratio.free") : value}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setRatio(value);
                      setRatioOpen(false);
                    }}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {notice ? (
            <Animated.View
              entering={riseIn}
              exiting={fadeOut}
              pointerEvents="none"
              className="absolute self-center rounded-full bg-foreground/90 px-4 py-2.5"
              style={{ bottom: controlsBottom + 170 }}
            >
              <Text className="text-[15px] font-medium text-background">{notice}</Text>
            </Animated.View>
          ) : null}

          {/* Bottom: zoom · mode switch · hint, then thumbnail · shutter · flip. */}
          <View
            pointerEvents="box-none"
            onLayout={onControlsLayout}
            className="absolute inset-x-0 items-center gap-4"
            style={{ bottom: controlsBottom, paddingLeft: insets.left, paddingRight: insets.right }}
          >
            {zoom > 0.01 && !capture.recording ? (
              <Animated.View entering={fadeIn} exiting={fadeOut}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("camera.resetZoom")}
                  onPress={() => setZoom(0)}
                  className="flex-row items-center gap-2 rounded-full bg-black/45 px-3 py-1.5"
                >
                  <Icon as={ZoomIn} size={15} className="text-amber-400" />
                  <View className="h-1 w-16 overflow-hidden rounded-full bg-white/25">
                    <View className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round(zoom * 100)}%` }} />
                  </View>
                  <Icon as={X} size={14} className="text-white/80" />
                </Pressable>
              </Animated.View>
            ) : null}

            {!busy ? (
              <GlassPanel radius={999} padding={3}>
                <View className="flex-row">
                  {MODES.map(({ mode: m, label }) => (
                    <Pressable
                      key={m}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: mode === m }}
                      onPress={() => void capture.setMode(m)}
                      className={cn("rounded-full px-4 py-1.5", mode === m && (m === "moments" ? "bg-rose-400" : "bg-foreground/15"))}
                    >
                      <Text
                        className={cn(
                          "text-[14px] font-semibold",
                          mode !== m && "text-muted-foreground",
                          mode === m && m === "moments" && "text-black",
                        )}
                      >
                        {t(label)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </GlassPanel>
            ) : null}

            {hint ? (
              <Text className="text-[13px] font-medium text-white/80" style={{ textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>
                {hint}
              </Text>
            ) : null}

            <View className="w-full max-w-md flex-row items-center justify-between px-8">
              {/* Last capture + its upload state. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("camera.lastCapture")}
                disabled={!capture.last}
                onPress={() => router.navigate("/")}
                className="size-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/80 bg-black/30"
                style={{ opacity: capture.last ? 1 : 0 }}
              >
                {capture.last?.preview ? (
                  <Image source={{ uri: capture.last.preview }} contentFit="cover" style={StyleSheet.absoluteFill} />
                ) : capture.last ? (
                  <Icon as={Video} size={22} className="text-white" />
                ) : null}
                {lastItem && lastItem.status !== "done" ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    {lastItem.status === "error" ? (
                      <Icon as={CircleAlert} size={22} className="text-white" />
                    ) : (
                      <ActivityIndicator color="white" />
                    )}
                  </View>
                ) : null}
              </Pressable>

              <View className="items-center justify-center">
                <ShutterButton
                  video={video}
                  moment={moment}
                  recording={capture.recording || counting}
                  disabled={!ready || capture.capturing || !!draft}
                  label={t(shutterLabel)}
                  hint={hint ?? undefined}
                  onPress={moment ? undefined : () => void capture.shutter()}
                  onPressIn={moment ? capture.momentPressIn : undefined}
                  onPressOut={moment ? capture.momentPressOut : undefined}
                />
                {capture.preparing ? (
                  <View pointerEvents="none" className="absolute">
                    <ActivityIndicator color="white" />
                  </View>
                ) : null}
              </View>

              <GlassButton size={52} accessibilityLabel={t("camera.flip")} disabled={busy} onPress={flip}>
                <Icon as={SwitchCamera} size={22} />
              </GlassButton>
            </View>
          </View>

          {draft ? (
            <MomentReview
              draft={draft}
              onClose={() => setDraft(null)}
              onPosted={() => {
                setDraft(null);
                flashNotice(t("camera.savedMoment"));
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function RatioChip({
  value,
  active,
  label,
  onPress,
}: {
  value: AspectRatio;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className={cn("h-8 min-w-11 items-center justify-center rounded-full px-3", active && "bg-white")}
      testID={`ratio-${value}`}
    >
      <Text className={cn("text-[13px] font-semibold tabular-nums", active ? "text-black" : "text-white/85")}>{label}</Text>
    </Pressable>
  );
}
