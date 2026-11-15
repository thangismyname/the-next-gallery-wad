import { useTranslation } from "react-i18next";
import { Flashlight, FlashlightOff, Settings2, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AspectRatio, TimerOption } from "@tng/shared";

type Props = {
  onBack: () => void;
  showSettings: boolean;
  disabled: boolean;
  onToggleSettings: () => void;
  aspectRatio: AspectRatio;
  timerDelay: TimerOption;
  /** Đèn (torch) — chỉ hiện khi camera hỗ trợ (thường là camera sau trên Android). */
  torchSupported: boolean;
  torch: boolean;
  onToggleTorch: () => void;
};

const iconButton =
  "grid size-10 place-items-center rounded-full bg-black/30 text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white disabled:opacity-40";

/**
 * Thanh trên NỔI trên khung ngắm (không chiếm chỗ của khung): thoát · tiêu đề
 * + chip cài đặt đang bật (tỉ lệ, hẹn giờ) · mở cài đặt. Chừa tai thỏ (safe-area-top).
 */
const CameraTopBar: React.FC<Props> = ({
  onBack,
  showSettings,
  disabled,
  onToggleSettings,
  aspectRatio,
  timerDelay,
  torchSupported,
  torch,
  onToggleTorch,
}) => {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-linear-to-b from-black/55 to-transparent px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-6">
      <div className="pointer-events-auto flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className={iconButton} aria-label={t("camera.back")} title={t("camera.back")}>
          <X className="size-5" />
        </button>

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="hidden truncate text-sm font-semibold tracking-wide sm:inline">{t("camera.title")}</span>
          {aspectRatio !== "free" && (
            <span className="rounded-full bg-black/40 px-2 py-0.5 font-mono text-[11px] backdrop-blur-sm">{aspectRatio}</span>
          )}
          {timerDelay > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold text-black">
              <Timer className="size-3" />
              {timerDelay}s
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={onToggleTorch}
              className={cn(iconButton, torch && "bg-amber-400 text-black hover:bg-amber-300 hover:text-black")}
              aria-label={t("camera.torch")}
              aria-pressed={torch}
              title={t("camera.torch")}
            >
              {torch ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSettings}
            disabled={disabled}
            className={cn(iconButton, showSettings && "bg-white text-black hover:bg-white/90 hover:text-black")}
            aria-label={t("camera.settings")}
            aria-pressed={showSettings}
            title={t("camera.settings")}
          >
            <Settings2 className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraTopBar;
