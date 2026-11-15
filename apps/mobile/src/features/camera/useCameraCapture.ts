import { MOMENTS_MAX_DURATION } from "@tng/shared";
import { CameraView, useMicrophonePermissions, type CameraMode } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Platform } from "react-native";

import { describeFile, useUploadQueue } from "@/features/upload/useUploadQueue";

/** photo · video · moment (tap = photo, hold = video ≤ MOMENTS_MAX_DURATION s, reviewed then posted). */
export type CaptureMode = "picture" | "video" | "moments";

/** A moment shot waiting for review (caption → post). */
export type MomentDraft = { uri: string; video: boolean };

/** Holding the shutter longer than this in Moments = record a video. */
const HOLD_MS = 250;
/** Android: wait at most this long for the camera to rebind in video mode. */
const READY_TIMEOUT = 2500;

type Photo = { uri: string; width: number; height: number };

type Options = {
  onError: () => void;
  /** Self-timer seconds for photos (0 = off). */
  timer?: number;
  /** Post-process a photo (aspect-ratio crop) → uri to keep. */
  processPhoto?: (photo: Photo) => Promise<string>;
  /** A moment was shot → show the review screen. */
  onMoment: (draft: MomentDraft) => void;
};

/**
 * Take photos / record videos with `CameraView`. Photo + Video go straight to the
 * upload queue (`last` = latest capture + its upload id for the thumbnail state).
 * Moments: tap = photo, hold = video up to 5 s → `onMoment` (review, then post).
 *
 * Camera mode: iOS keeps the photo output in video mode, so Moments runs in
 * "video" (tap and hold both instant). Android binds either photo OR video, so
 * Moments stays in "picture" and switches to "video" when a hold starts (waits for
 * `onCameraReady`, ~0.3 s) and back after.
 */
export function useCameraCapture(camera: RefObject<CameraView | null>, opts: Options) {
  const { timer = 0 } = opts;
  const [mode, setModeState] = useState<CaptureMode>("picture");
  const [androidVideo, setAndroidVideo] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [last, setLast] = useState<{ uploadId: string; preview: string | null } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [mic, requestMic] = useMicrophonePermissions();
  const startedAt = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const released = useRef(true);
  const readyWaiters = useRef<(() => void)[]>([]);
  // Callbacks from the screen, read when an async capture finishes (not during render).
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  const cameraMode: CameraMode =
    mode === "video" || (mode === "moments" && (Platform.OS === "ios" || androidVideo)) ? "video" : "picture";

  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = null;
    setCountdown(0);
  }, []);
  useEffect(
    () => () => {
      cancelCountdown();
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [cancelCountdown],
  );

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    startedAt.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [recording]);

  /** Call from `onCameraReady` (resolves a pending Android mode switch). */
  const onReady = useCallback(() => {
    const waiters = readyWaiters.current;
    readyWaiters.current = [];
    waiters.forEach((resolve) => resolve());
  }, []);
  const waitReady = () =>
    new Promise<void>((resolve) => {
      readyWaiters.current.push(resolve);
      setTimeout(resolve, READY_TIMEOUT);
    });

  const enqueue = (uri: string, video: boolean) => {
    const { name, type } = describeFile(uri, { video });
    const [uploadId] = useUploadQueue.getState().enqueue([{ uri, name, type, preview: video ? null : uri }]);
    setLast({ uploadId, preview: video ? null : uri });
  };

  const setMode = useCallback(
    async (next: CaptureMode) => {
      if (recording || preparing) return;
      cancelCountdown();
      // Video sound needs the microphone; without it the video is recorded muted.
      if (next !== "picture" && !mic?.granted && mic?.canAskAgain !== false) await requestMic();
      setModeState(next);
    },
    [recording, preparing, mic, requestMic, cancelCountdown],
  );

  /** Shoot a photo → (crop) → upload queue, or the moment review. */
  const takePhoto = async (forMoment: boolean) => {
    if (capturing || !camera.current) return;
    setCapturing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1, exif: true });
      if (!photo?.uri) return;
      const process = latest.current.processPhoto;
      const uri = process ? await process(photo) : photo.uri;
      if (forMoment) latest.current.onMoment({ uri, video: false });
      else enqueue(uri, false);
    } catch {
      latest.current.onError();
    } finally {
      setCapturing(false);
    }
  };

  const photoShutter = () => {
    if (countdownTimer.current) {
      cancelCountdown();
      return;
    }
    if (timer <= 0) {
      void takePhoto(false);
      return;
    }
    let left = timer;
    setCountdown(left);
    void Haptics.selectionAsync();
    countdownTimer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        void Haptics.selectionAsync();
        return;
      }
      cancelCountdown();
      void takePhoto(false);
    }, 1000);
  };

  const toggleRecording = async () => {
    const cam = camera.current;
    if (!cam) return;
    if (recording) {
      cam.stopRecording();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
    try {
      const video = await cam.recordAsync();
      if (video?.uri) enqueue(video.uri, true);
    } catch {
      latest.current.onError();
    } finally {
      setRecording(false);
    }
  };

  // ── Moments: hold to record ────────────────────────────────────────────
  const recordMoment = async () => {
    if (Platform.OS === "android") {
      setPreparing(true);
      setAndroidVideo(true);
      await waitReady();
      setPreparing(false);
      // Let go while the camera was switching → nothing recorded.
      if (released.current) {
        setAndroidVideo(false);
        return;
      }
    }
    const cam = camera.current;
    if (!cam) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
    try {
      const video = await cam.recordAsync({ maxDuration: MOMENTS_MAX_DURATION });
      if (video?.uri) latest.current.onMoment({ uri: video.uri, video: true });
    } catch {
      latest.current.onError();
    } finally {
      setRecording(false);
      if (Platform.OS === "android") setAndroidVideo(false);
    }
  };

  const momentPressIn = () => {
    if (capturing || recording || preparing) return;
    released.current = false;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      void recordMoment();
    }, HOLD_MS);
  };

  const momentPressOut = () => {
    released.current = true;
    if (holdTimer.current) {
      // Short tap → photo.
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      void takePhoto(true);
      return;
    }
    if (recording) camera.current?.stopRecording();
  };

  return {
    mode,
    setMode,
    /** `CameraView` `mode` prop. */
    cameraMode,
    onReady,
    recording,
    preparing,
    seconds,
    capturing,
    last,
    muted: !mic?.granted,
    countdown,
    cancelCountdown,
    /** Tap handler (photo / video). Moments uses `momentPressIn` / `momentPressOut`. */
    shutter: mode === "picture" ? photoShutter : toggleRecording,
    momentPressIn,
    momentPressOut,
  };
}
