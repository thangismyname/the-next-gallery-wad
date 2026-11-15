import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fitCropBox, formatTimer } from "@/features/camera/camera.media";
import {
  RATIO_MAP,
  type AspectRatio,
  type CameraError,
  type CameraPreview as PreviewData,
} from "@tng/shared";
import CameraErrorPanel from "./CameraErrorPanel";
import CameraPreview from "./CameraPreview";

type Props = {
  error: CameraError | null;
  onRetry: () => void;
  ready: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  vfBoxRef: React.RefObject<HTMLDivElement | null>;
  vfSize: { w: number; h: number };
  aspectRatio: AspectRatio;
  mirror: boolean;
  showGrid: boolean;
  countdown: number;
  recording: boolean;
  timer: number;
  preview: PreviewData | null;
  saved: boolean;
  saving: boolean;
  saveError: string | null;
  /** Tăng mỗi lần chụp ảnh → nháy trắng. */
  flashKey: number;
  onReset: () => void;
  onSave: () => void;
};

const CameraViewfinder: React.FC<Props> = ({
  error,
  onRetry,
  ready,
  videoRef,
  vfBoxRef,
  vfSize,
  aspectRatio,
  mirror,
  showGrid,
  countdown,
  recording,
  timer,
  preview,
  saved,
  saving,
  saveError,
  flashKey,
  onReset,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 overflow-hidden">
      {error ? (
        <CameraErrorPanel error={error} onRetry={onRetry} />
      ) : !ready ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
          <Loader2 className="size-8 animate-spin" />
          <span className="text-sm">{t("camera.opening")}</span>
        </div>
      ) : (
        <>
          {/* Vùng đặt khung: chừa thanh trên nổi (khung tỉ lệ không bị che). */}
          <div
            ref={vfBoxRef}
            className="absolute inset-x-2 top-[calc(max(env(safe-area-inset-top),0.75rem)+3rem)] bottom-2 flex items-center justify-center"
          >
            <div
              className={cn(
                "relative overflow-hidden",
                aspectRatio !== "free" ? "rounded-lg shadow-[0_0_0_100vmax] shadow-black/50" : "rounded-lg",
              )}
              style={
                vfSize.w > 0 && vfSize.h > 0
                  ? {
                      width: fitCropBox(vfSize.w, vfSize.h, RATIO_MAP[aspectRatio]).w,
                      height: fitCropBox(vfSize.w, vfSize.h, RATIO_MAP[aspectRatio]).h,
                    }
                  : { width: "100%", height: "100%" }
              }
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "h-full w-full",
                  aspectRatio === "free" ? "object-contain" : "object-cover",
                  mirror && "-scale-x-100",
                )}
              />

              {/* Viền khung tỉ lệ */}
              {aspectRatio !== "free" && (
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/40 ring-inset" />
              )}

              {/* Rule-of-thirds grid — bám theo khung tỉ lệ */}
              {showGrid && (
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/40" />
                  <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white/40" />
                  <div className="absolute left-0 right-0 top-1/3 h-px bg-white/40" />
                  <div className="absolute left-0 right-0 top-2/3 h-px bg-white/40" />
                </div>
              )}
            </div>
          </div>

          {/* Countdown */}
          {countdown > 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <span
                key={countdown}
                className="font-heading text-9xl font-bold text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-50 duration-300"
              >
                {countdown}
              </span>
            </div>
          )}
        </>
      )}

      {!error && ready && recording && (
        <div className="absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+0.25rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-sm font-medium shadow-lg">
          <span className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-white" />
            <span className="tabular-nums">{formatTimer(timer)}</span>
            <span className="hidden text-white/80 sm:inline">
              {t("camera.recording")}
            </span>
          </span>
        </div>
      )}

      {/* Nháy trắng khi chụp (phản hồi tức thì, trước khi ảnh xem lại hiện ra) */}
      {flashKey > 0 && (
        <div
          key={flashKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 bg-white/85 animate-out fade-out fill-mode-forwards duration-300 motion-reduce:hidden"
        />
      )}

      {/* Preview sau khi chụp/quay */}
      {preview && (
        <CameraPreview
          preview={preview}
          saved={saved}
          saving={saving}
          error={saveError}
          onReset={onReset}
          onSave={onSave}
        />
      )}
    </div>
  );
};

export default CameraViewfinder;