import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatZoom, zoomPresets, type ZoomRange } from "@/features/camera/camera.media";

type Props = {
  range: ZoomRange;
  zoom: number;
  onZoom: (value: number) => void;
  disabled?: boolean;
};

/**
 * Chip zoom nhanh (chỉ hiện khi camera hỗ trợ zoom phần cứng). Chip đang chọn =
 * mức gần nhất ≤ zoom hiện tại và hiển thị đúng giá trị (vd "1.4×" khi pinch).
 */
const CameraZoomChips: React.FC<Props> = ({ range, zoom, onZoom, disabled }) => {
  const { t } = useTranslation();
  const presets = zoomPresets(range);
  let active = 0;
  presets.forEach((p, i) => {
    if (p <= zoom + 0.01) active = i;
  });

  return (
    <div
      role="group"
      aria-label={t("camera.zoom")}
      className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/40 p-1 backdrop-blur-md"
    >
      {presets.map((p, i) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onZoom(p)}
          aria-pressed={i === active}
          className={cn(
            "grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition",
            i === active
              ? "bg-white/20 text-amber-300"
              : "text-white/80 hover:bg-white/10 hover:text-white",
          )}
        >
          {formatZoom(i === active ? zoom : p)}
        </button>
      ))}
    </div>
  );
};

export default CameraZoomChips;
