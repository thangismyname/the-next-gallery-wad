import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadMedia } from "@/services/media";
import { createMoment } from "@/services/moments";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import { MOMENTS_MAX_DURATION, type CameraMode, type CameraPreview, type FacingMode, momentsFeedQueryKey } from "@tng/shared";
import {
  applyTrackSettings,
  captureFrame,
  clampZoom,
  createRecordPipeline,
  pickMime,
  readTrackCaps,
  type RecordPipeline,
  type TrackCaps,
} from "./camera.media";
import { useCameraPrefs } from "./useCameraPrefs";
import { useCameraStream } from "./useCameraStream";

// Giữ nút lâu hơn ngưỡng này ở chế độ Moments = quay video (chạm nhanh = chụp ảnh).
const HOLD_TO_RECORD_MS = 250;

export type UseCameraOptions = {
  /** Override hành động "Lưu" mặc định (upload + tự đăng moment). */
  onSave?: (preview: CameraPreview) => Promise<void>;
  /** Mode to open in (e.g. `/camera?mode=moments` from the Gallery "Recent moments" "+"). */
  initialMode?: CameraMode;
};

export function useCamera(opts?: UseCameraOptions) {
  const queryClient = useQueryClient();
  const customSave = opts?.onSave ?? null;

  const [mode, setMode] = useState<CameraMode>(opts?.initialMode ?? "photo");
  const [facing, setFacing] = useState<FacingMode>("user");
  const [mirror, setMirror] = useState(true);
  const { aspectRatio, setAspectRatio, showGrid, toggleGrid, timerDelay, cycleTimer } =
    useCameraPrefs();
  const [countdown, setCountdown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [preview, setPreview] = useState<CameraPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Tab bị ẩn → tắt camera (đèn camera tắt), trừ khi đang quay.
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  // Zoom / đèn phần cứng của track hiện tại (null / false = không hỗ trợ → ẩn UI).
  const [caps, setCaps] = useState<TrackCaps>({ zoom: null, torch: false });
  const [zoom, setZoomState] = useState(1);
  const [torch, setTorchState] = useState(false);
  // Chỉ 1 camera (đa số desktop) → ẩn nút đổi camera.
  const [canFlip, setCanFlip] = useState(true);
  // Tăng mỗi lần chụp → overlay nháy trắng (key mới = animation chạy lại).
  const [flashKey, setFlashKey] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef("");
  // Pipeline canvas khi quay video có lật gương / crop (camera.media.ts).
  const pipelineRef = useRef<RecordPipeline | null>(null);
  const countdownRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const vfBoxRef = useRef<HTMLDivElement>(null);
  const [vfSize, setVfSize] = useState({ w: 0, h: 0 });

  const stopMirrorPipeline = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
  }, []);

  const { stream, ready, error, setError, videoRef, stopStream } = useCameraStream(
    facing,
    retryKey,
    stopMirrorPipeline,
    hidden && !recording,
  );
  const videoTrack = stream?.getVideoTracks()[0];

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Luồng mới (mở / đổi camera / quay lại tab) → đọc khả năng zoom + đèn, về mức nhỏ nhất.
  useEffect(() => {
    const next = readTrackCaps(videoTrack);
    setCaps(next);
    setZoomState(next.zoom ? clampZoom(Math.max(1, next.zoom.min), next.zoom) : 1);
    setTorchState(false);
  }, [videoTrack]);

  // Đếm camera sau khi đã có quyền (trước đó trình duyệt giấu danh sách thiết bị).
  useEffect(() => {
    if (!ready) return;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => setCanFlip(list.filter((d) => d.kind === "videoinput").length > 1))
      .catch(() => {});
  }, [ready]);

  // Gộp nhiều lần đổi zoom (pinch) vào 1 lần applyConstraints / frame.
  const setZoom = useCallback(
    (value: number) => {
      if (!caps.zoom) return;
      const next = clampZoom(value, caps.zoom);
      setZoomState(next);
      if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = requestAnimationFrame(() => {
        zoomRafRef.current = null;
        void applyTrackSettings(videoTrack, { zoom: next });
      });
    },
    [caps.zoom, videoTrack],
  );

  const toggleTorch = useCallback(() => {
    if (!caps.torch) return;
    const next = !torch;
    setTorchState(next);
    void applyTrackSettings(videoTrack, { torch: next });
  }, [caps.torch, torch, videoTrack]);

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
      if (recRef.current && recRef.current.state === "recording") {
        try {
          recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      pipelineRef.current?.stop();
      pipelineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const box = vfBoxRef.current;
    if (!box) return;
    const update = () =>
      setVfSize({ w: box.clientWidth, h: box.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [ready]);

  const updatePreview = (next: CameraPreview | null) => {
    previewUrlRef.current = next?.url ?? "";
    setPreview(next);
  };

  const flipCamera = () => {
    if (recording || preview || !canFlip) return;
    stopStream();
    const next: FacingMode = facing === "user" ? "environment" : "user";
    setFacing(next);
    // Selfie lật như gương; camera sau giữ nguyên (chữ không bị ngược).
    setMirror(next === "user");
  };

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlashKey((k) => k + 1);
    void captureFrame(video, { mirror, ratio: aspectRatio }).then((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      updatePreview({ kind: "photo", url: URL.createObjectURL(blob), file, mode });
    });
  }, [videoRef, mirror, aspectRatio, mode]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(0);
    setRecording(false);
    if (recRef.current && recRef.current.state === "recording") {
      recRef.current.stop();
    }
    recRef.current = null;
  }, []);

  const startRecording = useCallback((maxDuration: number | null = null) => {
    if (!stream || recording) return;
    if (typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return;
    }
    chunksRef.current = [];

    const pipeline = createRecordPipeline(stream, videoRef.current, { mirror, ratio: aspectRatio });
    pipelineRef.current = pipeline;
    const recordStream = pipeline?.stream ?? stream;

    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(recordStream, { mimeType: mime })
        : new MediaRecorder(recordStream);
    } catch {
      stopMirrorPipeline();
      setError("unsupported");
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stopMirrorPipeline();
      const finalMime = rec.mimeType || pickMime() || "video/webm";
      const ext = finalMime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type: finalMime });
      const file = new File([blob], `capture-${Date.now()}.${ext}`, {
        type: finalMime,
      });
      updatePreview({
        kind: "video",
        url: URL.createObjectURL(blob),
        file,
        mode,
      });
    };
    recRef.current = rec;
    rec.start(250);
    startTsRef.current = Date.now();
    setRecording(true);
    setTimer(0);
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
      if (maxDuration !== null) {
        setTimer(Math.min(elapsed, maxDuration));
        if (elapsed >= maxDuration) stopRecording();
      } else {
        setTimer(elapsed);
      }
    }, 250);
  }, [stream, recording, videoRef, mirror, aspectRatio, mode, stopRecording, stopMirrorPipeline, setError]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  /**
   * Nhấn nút chụp (chuột / chạm / phím Space).
   * - photo: chụp ảnh (hoặc đếm ngược nếu bật hẹn giờ).
   * - video: chạm để bắt đầu, chạm lần nữa để dừng (quay bình thường).
   * - moments: chạm nhanh = chụp ảnh, giữ = quay video tối đa 5 giây.
   */
  const shutterPress = () => {
    if (preview || saving || !ready || error) return;
    if (countdown > 0) {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      countdownRef.current = null;
      setCountdown(0);
      return;
    }
    if (mode === "photo") {
      if (timerDelay > 0) {
        let remaining = timerDelay;
        setCountdown(remaining);
        countdownRef.current = window.setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (countdownRef.current) window.clearInterval(countdownRef.current);
            countdownRef.current = null;
            setCountdown(0);
            capturePhoto();
          } else {
            setCountdown(remaining);
          }
        }, 1000);
      } else {
        capturePhoto();
      }
    } else if (mode === "video") {
      if (recording) stopRecording();
      else startRecording();
    } else {
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        startRecording(MOMENTS_MAX_DURATION);
      }, HOLD_TO_RECORD_MS);
    }
  };

  const handleShutterDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (preview || saving || !ready || error) return;
    // Giữ pointer khi kéo ngón tay ra ngoài nút (Moments = giữ để quay).
    e.currentTarget.setPointerCapture(e.pointerId);
    shutterPress();
  };

  const handleShutterUp = () => {
    if (mode !== "moments") return;
    if (holdTimerRef.current) {
      clearHoldTimer();
      capturePhoto();
      return;
    }
    if (recRef.current?.state === "recording") stopRecording();
  };

  const handleShutterCancel = () => {
    if (mode !== "moments") return;
    if (holdTimerRef.current) {
      clearHoldTimer();
      return;
    }
    if (recRef.current?.state === "recording") stopRecording();
  };

  const resetPreview = useCallback(() => {
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = null;
    clearHoldTimer();
    setCountdown(0);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreview(null);
    setSaving(false);
    setSaved(false);
    setSaveError(null);
  }, [clearHoldTimer]);

  const savePreview = async () => {
    if (!preview || saving || saved) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Override tuỳ chỉnh (vd: gửi reaction) — không upload/đăng moment mặc định.
      if (customSave) {
        await customSave(preview);
        setSaving(false);
        return;
      }
      const uploaded = await uploadMedia([preview.file]);
      const mediaId = uploaded[0];

      // Chỉ chế độ Moments mới tự đăng lên bảng tin bạn bè.
      if (mediaId && preview.mode === "moments") {
        try {
          await createMoment({ mediaId, visibility: "circle" });
        } catch {
          setSaveError("camera.momentFailed");
        }
      }

      queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      if (preview.mode === "moments") {
        queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey });
      }
      setSaved(true);
      savedTimerRef.current = window.setTimeout(() => {
        resetPreview();
      }, 1800);
    } catch {
      setSaving(false);
      setSaveError("camera.saveFailed");
    }
  };

  return {
    mode,
    setMode,
    mirror,
    setMirror,
    aspectRatio,
    setAspectRatio,
    showGrid,
    toggleGrid,
    timerDelay,
    cycleTimer,
    countdown,
    showSettings,
    setShowSettings,
    ready,
    error,
    retry: () => setRetryKey((k) => k + 1),
    recording,
    timer,
    preview,
    saving,
    saved,
    saveError,
    videoRef,
    vfBoxRef,
    vfSize,
    flipCamera,
    canFlip,
    zoomRange: caps.zoom,
    zoom,
    setZoom,
    torchSupported: caps.torch,
    torch,
    toggleTorch,
    flashKey,
    shutterPress,
    handleShutterDown,
    handleShutterUp,
    handleShutterCancel,
    resetPreview,
    savePreview,
  };
}