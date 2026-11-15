import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOMENTS_MAX_DURATION, type CameraMode, type TimerOption } from "@tng/shared";
import CameraGalleryShortcut from "./CameraGalleryShortcut";

type Props = {
  mode: CameraMode;
  onModeChange: (mode: CameraMode) => void;
  recording: boolean;
  countdown: number;
  timerDelay: TimerOption;
  timer: number;
  onFlip: () => void;
  /** false = máy chỉ có 1 camera → ẩn nút đổi camera (giữ chỗ để nút chụp vẫn ở giữa). */
  canFlip: boolean;
  onShutterDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onShutterUp: () => void;
  onShutterCancel: () => void;
};

const MODES: CameraMode[] = ["photo", "video", "moments"];

const MODE_LABEL: Record<CameraMode, string> = {
  photo: "camera.photoShort",
  video: "camera.videoShort",
  moments: "camera.momentsShort",
};

/**
 * Cụm điều khiển. Dọc: dưới khung ngắm — chế độ · [Thư viện | nút chụp | đổi
 * camera] · gợi ý. Ngang / desktop (`wide:`): cột bên phải, cùng thứ tự theo
 * chiều dọc. Chừa thanh home (safe-area-bottom) / cạnh phải (safe-area-right).
 */
const CameraControls: React.FC<Props> = ({
  mode,
  onModeChange,
  recording,
  countdown,
  timerDelay,
  timer,
  onFlip,
  canFlip,
  onShutterDown,
  onShutterUp,
  onShutterCancel,
}) => {
  const { t } = useTranslation();
  const disabled = recording || countdown > 0;

  const hint =
    countdown > 0
      ? t("camera.countdownHint")
      : recording
        ? t(mode === "moments" ? "camera.hintMomentsRecording" : "camera.hintVideoRecording")
        : mode === "photo"
          ? timerDelay > 0
            ? t("camera.hintPhotoTimer", { seconds: timerDelay })
            : t("camera.hintPhoto")
          : mode === "video"
            ? t("camera.hintVideo")
            : t("camera.hintMoments");

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-4 px-6 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]",
        "wide:w-40 wide:justify-center wide:gap-6 wide:px-4 wide:py-6 wide:pr-[max(env(safe-area-inset-right),1rem)]",
      )}
    >
      {/* Chế độ ảnh / video / moments */}
      <div
        role="radiogroup"
        className="flex items-center gap-0.5 rounded-full bg-white/10 p-1 wide:flex-col wide:rounded-2xl"
      >
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={disabled}
            onClick={() => onModeChange(value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase transition wide:w-full wide:rounded-xl",
              // Moment = rose, like the mobile camera (pill + shutter ring).
              mode === value
                ? value === "moments"
                  ? "bg-rose-400 text-black"
                  : "bg-white text-black"
                : value === "moments"
                  ? "text-rose-300/80 hover:text-rose-300"
                  : "text-white/70 hover:text-white",
              disabled && "opacity-40",
            )}
          >
            {t(MODE_LABEL[value])}
          </button>
        ))}
      </div>

      {/* Thư viện · nút chụp · đổi camera */}
      <div className="grid w-full max-w-xs grid-cols-[1fr_auto_1fr] items-center justify-items-center wide:max-w-none wide:grid-cols-1 wide:grid-rows-[auto_auto_auto] wide:gap-6">
        <CameraGalleryShortcut disabled={disabled} />

        <button
          type="button"
          className="relative touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-white/70"
          onPointerDown={onShutterDown}
          onPointerUp={onShutterUp}
          onPointerCancel={onShutterCancel}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={
            mode === "photo"
              ? t("camera.photoMode")
              : mode === "video"
                ? t("camera.videoMode")
                : t("camera.momentsMode")
          }
        >
          <span
            className={cn(
              "block size-19 rounded-full border-4 transition-colors sm:size-20",
              mode === "moments"
                ? recording
                  ? "border-red-500"
                  : "border-rose-400"
                : recording
                  ? "border-white/90"
                  : "border-white/50",
            )}
          />
          <span
            className={cn(
              "absolute inset-2.5 grid place-items-center rounded-full transition-all active:scale-90",
              mode === "video" || recording ? "bg-red-500" : "bg-white",
              recording && "inset-5 rounded-lg",
            )}
          />
          {/* Vòng tiến độ quay (Moments tối đa MOMENTS_MAX_DURATION giây) */}
          {mode === "moments" && recording && (
            <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 80 80" aria-hidden>
              <circle
                cx="40"
                cy="40"
                r="38"
                fill="none"
                stroke="currentColor"
                className="text-rose-400"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="238.76"
                strokeDashoffset={String(
                  238.76 *
                    (1 - Math.min(timer, MOMENTS_MAX_DURATION) / MOMENTS_MAX_DURATION),
                )}
              />
            </svg>
          )}
        </button>

        {canFlip ? (
          <button
            type="button"
            onClick={onFlip}
            disabled={disabled}
            className="grid size-12 place-items-center rounded-full bg-white/10 text-white/85 transition hover:bg-white/20 hover:text-white active:rotate-180 disabled:opacity-40"
            aria-label={t("camera.flip")}
            title={t("camera.flip")}
          >
            <SwitchCamera className="size-5.5" />
          </button>
        ) : (
          <span className="size-12" aria-hidden />
        )}
      </div>

      <p className="max-w-xs text-center text-[11px] text-white/55 wide:text-[10px]">
        {hint}
        <span className="hidden lg:block lg:pt-1 lg:text-white/35">{t("camera.keyHint")}</span>
      </p>
    </div>
  );
};

export default CameraControls;
