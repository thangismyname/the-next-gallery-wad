import { useTranslation } from "react-i18next";
import { FlipHorizontal2, Grid3X3, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASPECT_RATIOS, type AspectRatio, type TimerOption } from "@tng/shared";

type Props = {
  aspectRatio: AspectRatio;
  onAspectChange: (ratio: AspectRatio) => void;
  showGrid: boolean;
  onGridToggle: () => void;
  timerDelay: TimerOption;
  onTimerToggle: () => void;
  mirror: boolean;
  onMirrorToggle: () => void;
};

const toggleClass = (on: boolean) =>
  cn(
    "relative grid size-9 shrink-0 place-items-center rounded-full transition",
    on ? "bg-white text-black" : "text-white/75 hover:bg-white/15 hover:text-white",
  );

/**
 * Bảng cài đặt NỔI ngay dưới thanh trên (không đẩy khung ngắm): tỉ lệ khung +
 * lưới / hẹn giờ / lật gương. Màn hẹp tự xuống 2 dòng.
 */
const CameraSettingsBar: React.FC<Props> = ({
  aspectRatio,
  onAspectChange,
  showGrid,
  onGridToggle,
  timerDelay,
  onTimerToggle,
  mirror,
  onMirrorToggle,
}) => {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-x-3 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)] z-30 flex justify-center animate-in fade-in slide-in-from-top-2 duration-150 wide:top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] wide:right-3 wide:left-auto wide:justify-end">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-black/60 p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur-md wide:flex-nowrap">
        <div className="flex max-w-full gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {ASPECT_RATIOS.map(({ value }) => (
            <button
              key={value}
              type="button"
              onClick={() => onAspectChange(value)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition",
                aspectRatio === value ? "bg-white text-black" : "text-white/75 hover:text-white",
              )}
              aria-pressed={aspectRatio === value}
              title={t(`camera.ratio.${value}`)}
            >
              {value === "free" ? t("camera.ratio.free") : value}
            </button>
          ))}
        </div>

        <span className="hidden h-6 w-px bg-white/15 sm:block" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onGridToggle}
            className={toggleClass(showGrid)}
            aria-pressed={showGrid}
            aria-label={t("camera.grid")}
            title={t("camera.grid")}
          >
            <Grid3X3 className="size-4" />
          </button>
          <button
            type="button"
            onClick={onTimerToggle}
            className={toggleClass(timerDelay > 0)}
            aria-pressed={timerDelay > 0}
            aria-label={t("camera.timer")}
            title={t("camera.timer")}
          >
            <Timer className="size-4" />
            {timerDelay > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-black">
                {timerDelay}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onMirrorToggle}
            className={toggleClass(mirror)}
            aria-pressed={mirror}
            aria-label={t("camera.mirror")}
            title={t("camera.mirror")}
          >
            <FlipHorizontal2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraSettingsBar;
