import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraError, FacingMode } from "@tng/shared";
import { startStream } from "./camera.media";

/**
 * Luồng camera: mở theo `facing` (đổi camera / `retryKey` đổi → mở lại), gắn vào
 * `<video ref={videoRef}>`, tắt khi unmount. `onStop` chạy mỗi khi luồng bị tắt
 * (dừng pipeline quay video đang dùng luồng này). `paused` = tắt hẳn camera (đèn
 * camera tắt) cho tới khi hết pause — vd khi tab bị ẩn.
 */
export function useCameraStream(
  facing: FacingMode,
  retryKey: number,
  onStop: () => void,
  paused = false,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    onStop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setReady(false);
  }, [onStop]);

  useEffect(() => {
    let cancelled = false;
    if (paused) return;
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
  }, [facing, retryKey, stopStream, paused]);

  // Gắn luồng vào <video> mỗi khi luồng đổi.
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [stream]);

  // Unmount giữa chừng (vd đang mở camera) → tắt hẳn đèn camera.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  return { stream, ready, error, setError, videoRef, stopStream };
}
