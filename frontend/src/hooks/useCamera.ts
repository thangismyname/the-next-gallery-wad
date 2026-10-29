import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadMedia } from "@/services/media";
import { createMoment, momentsFeedQueryKey } from "@/services/moments";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import {
  MAX_DURATION,
  RATIO_MAP,
  VIDEO_MIMES,
  type AspectRatio,
  type CaptureError,
  type CaptureMode,
  type CapturePreview,
  type FacingMode,
  type TimerOption,
} from "@/types";

export const formatTimer = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
};

const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return undefined;
  return VIDEO_MIMES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
};

const startStream = async (facing: FacingMode) => {
  const video = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video });
  }
};

// Tính kích thước khung crop hiển thị trong viewfinder, giữ tỉ lệ, không vượt quá box.
export function fitCropBox(
  vw: number,
  vh: number,
  ratio: number | null,
): { w: number; h: number } {
  if (!ratio) return { w: vw, h: vh };
  const boxRatio = vw / vh;
  if (boxRatio > ratio) {
    return { w: Math.round(vh * ratio), h: vh };
  }
  return { w: vw, h: Math.round(vw / ratio) };
}

// Tạo canvas mới bị crop theo tỉ lệ (center crop). Trả về canvas gốc nếu ratio "free".
function applyAspectCrop(canvas: HTMLCanvasElement, ratio: AspectRatio): HTMLCanvasElement {
  const target = RATIO_MAP[ratio];
  if (!target) return canvas;
  const srcW = canvas.width;
  const srcH = canvas.height;
  const srcRatio = srcW / srcH;
  let sw = srcW;
  let sh = srcH;
  let sx = 0;
  let sy = 0;
  if (srcRatio > target) {
    sw = Math.round(srcH * target);
    sx = Math.round((srcW - sw) / 2);
  } else {
    sh = Math.round(srcW / target);
    sy = Math.round((srcH - sh) / 2);
  }
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

// Vẽ frame từ video lên canvas, áp dụng mirror + aspect crop tuỳ chọn.
function drawCameraFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  opts: { mirror: boolean; ratio: AspectRatio; width: number; height: number },
) {
  ctx.save();
  if (opts.mirror) {
    ctx.translate(opts.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, opts.width, opts.height);
  ctx.restore();
}

export type UseCameraOptions = {
  /** Override hành động "Lưu" mặc định (upload + tự đăng moment). */
  onSave?: (preview: CapturePreview) => Promise<void>;
};

export function useCamera(opts?: UseCameraOptions) {
  const queryClient = useQueryClient();
  const customSave = opts?.onSave ?? null;

  const [mode, setMode] = useState<CaptureMode>("photo");
  const [facing, setFacing] = useState<FacingMode>("user");
  const [mirror, setMirror] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [showGrid, setShowGrid] = useState(false);
  const [timerDelay, setTimerDelay] = useState<TimerOption>(0);
  const [countdown, setCountdown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CaptureError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef("");
  const mirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mirrorRafRef = useRef<number | null>(null);
  const mirrorStreamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<number | null>(null);
  const vfBoxRef = useRef<HTMLDivElement>(null);
  const [vfSize, setVfSize] = useState({ w: 0, h: 0 });

  const stopMirrorPipeline = useCallback(() => {
    if (mirrorRafRef.current) cancelAnimationFrame(mirrorRafRef.current);
    mirrorRafRef.current = null;
    mirrorCanvasRef.current = null;
    mirrorStreamRef.current?.getTracks().forEach((track) => track.stop());
    mirrorStreamRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    stopMirrorPipeline();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setReady(false);
  }, [stopMirrorPipeline]);

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      if (recRef.current && recRef.current.state === "recording") {
        try {
          recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (mirrorRafRef.current) cancelAnimationFrame(mirrorRafRef.current);
      mirrorStreamRef.current?.getTracks().forEach((track) => track.stop());
      mirrorStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return () => {
        cancelled = true;
      };
    }
    setError(null);
    setReady(false);
    startStream(facing)
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = s;
        setStream(s);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("denied");
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, retryKey, stopStream]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [stream]);

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

  const updatePreview = (next: CapturePreview | null) => {
    previewUrlRef.current = next?.url ?? "";
    setPreview(next);
  };

  const flipCamera = () => {
    if (recording || preview) return;
    stopStream();
    setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCameraFrame(ctx, video, {
      mirror,
      ratio: "free",
      width: canvas.width,
      height: canvas.height,
    });
    const cropped = applyAspectCrop(canvas, aspectRatio);
    cropped.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        updatePreview({
          kind: "photo",
          url: URL.createObjectURL(blob),
          file,
        });
      },
      "image/jpeg",
      0.92,
    );
  }, [mirror, aspectRatio]);

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

  const startRecording = useCallback(() => {
    if (!stream || recording) return;
    if (typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return;
    }
    chunksRef.current = [];

    let recordStream = stream;
    const videoEl = videoRef.current;
    const needsPipeline =
      !!videoEl &&
      videoEl.videoWidth > 0 &&
      (mirror || aspectRatio !== "free");
    if (needsPipeline) {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const target = RATIO_MAP[aspectRatio];
      let outW = vw;
      let outH = vh;
      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;
      if (target) {
        const srcRatio = vw / vh;
        if (srcRatio > target) {
          sw = Math.round(vh * target);
          sx = Math.round((vw - sw) / 2);
        } else {
          sh = Math.round(vw / target);
          sy = Math.round((vh - sh) / 2);
        }
        outW = sw;
        outH = sh;
      }

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (ctx && "captureStream" in canvas) {
        const full = document.createElement("canvas");
        full.width = vw;
        full.height = vh;
        const fullCtx = full.getContext("2d");
        if (fullCtx) {
          const draw = () => {
            drawCameraFrame(fullCtx, videoEl, {
              mirror,
              ratio: "free",
              width: vw,
              height: vh,
            });
            ctx.clearRect(0, 0, outW, outH);
            ctx.drawImage(full, sx, sy, sw, sh, 0, 0, outW, outH);
            mirrorRafRef.current = requestAnimationFrame(draw);
          };
          draw();
          mirrorCanvasRef.current = canvas;
          const canvasStream = canvas.captureStream(30);
          stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
          mirrorStreamRef.current = canvasStream;
          recordStream = canvasStream;
        }
      }
    }

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
      });
    };
    recRef.current = rec;
    rec.start(250);
    startTsRef.current = Date.now();
    setRecording(true);
    setTimer(0);
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
      setTimer(Math.min(elapsed, MAX_DURATION));
      if (elapsed >= MAX_DURATION) stopRecording();
    }, 250);
  }, [stream, recording, mirror, aspectRatio, stopRecording, stopMirrorPipeline]);

  const handleShutterDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (preview || saving || !ready || error) return;
    e.currentTarget.setPointerCapture(e.pointerId);
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
    } else {
      startRecording();
    }
  };

  const handleShutterUp = () => {
    if (mode === "video") stopRecording();
  };

  const handleShutterCancel = () => {
    if (mode === "video") stopRecording();
  };

  const resetCapture = useCallback(() => {
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(0);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreview(null);
    setSaving(false);
    setSaved(false);
  }, []);

  const saveCapture = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      // Override tuỳ chỉnh (vd: gửi reaction) — không upload/đăng moment mặc định.
      if (customSave) {
        await customSave(preview);
        setSaving(false);
        return;
      }
      const uploaded = await uploadMedia([preview.file]);
      const mediaId = uploaded[0];

      // Mọi ảnh chụp bằng capture đều tự đăng thành moment cho bạn bè xem
      if (mediaId) {
        try {
          await createMoment({ mediaId, visibility: "circle" });
        } catch (momentErr) {
          console.error("Không thể tự đăng moment:", momentErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey });
      setSaved(true);
      savedTimerRef.current = window.setTimeout(() => {
        resetCapture();
      }, 1800);
    } catch {
      setSaving(false);
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
    setShowGrid,
    timerDelay,
    setTimerDelay,
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
    videoRef,
    vfBoxRef,
    vfSize,
    flipCamera,
    handleShutterDown,
    handleShutterUp,
    handleShutterCancel,
    resetCapture,
    saveCapture,
  };
}