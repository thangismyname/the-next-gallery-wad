import { Fragment, memo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Aperture,
  Circle,
  Contrast,
  Disc,
  Droplet,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  SunMedium,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import type { EditRecipe } from "@tng/shared";
import { cn } from "@/lib/utils";
import { fromUnit, SLIDER_GROUPS, toUnit, type AdjustKey, type SliderDef } from "../recipe";

type Props = {
  recipe: EditRecipe;
  /** Đang kéo — chỉ vẽ lại, chưa vào lịch sử. */
  onPreview: (next: EditRecipe) => void;
  /** Thả tay / bàn phím / double-click = 1 bước undo. */
  onCommit: (next: EditRecipe) => void;
};

const ICONS: Record<AdjustKey, LucideIcon> = {
  exposure: Sun,
  contrast: Contrast,
  highlights: SunMedium,
  shadows: Moon,
  whites: Circle,
  blacks: Disc,
  temperature: Thermometer,
  tint: Droplet,
  vibrance: Sparkles,
  saturation: Palette,
  vignette: Aperture,
};

const format = ({ key }: SliderDef, value: number) =>
  key === "exposure" ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : `${value > 0 ? "+" : ""}${Math.round(value)}`;

/**
 * Kiểu Apple Photos: hàng icon tròn (vòng quanh icon = giá trị, xuôi chiều kim đồng hồ = +,
 * ngược = −) + thước vạch bên dưới để kéo công cụ đang chọn. Double-click thước = về 0.
 */
export const AdjustPanel = memo(function AdjustPanel({ recipe, onPreview, onCommit }: Props) {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<AdjustKey>("exposure");
  const def = SLIDER_GROUPS.flatMap((g) => g.sliders).find((s) => s.key === activeKey)!;
  const value = recipe[activeKey];
  const label = t(`editor.adjust.${activeKey}`);
  const set = (v: number) => ({ ...recipe, [activeKey]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-center gap-2 text-sm">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</span>
        <span className={cn("tabular-nums", value !== 0 && "font-medium")}>{format(def, value)}</span>
        {value !== 0 && (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={() => onCommit(set(0))}
            aria-label={`${t("editor.reset")} ${label}`}
            title={t("editor.reset")}
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>

      <Ruler
        def={def}
        value={value}
        label={label}
        onPreview={(v) => onPreview(set(v))}
        onCommit={(v) => onCommit(set(v))}
      />

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:justify-center">
        {SLIDER_GROUPS.map((group, gi) => (
          <Fragment key={group.id}>
            {gi > 0 && <span className="mx-1 h-6 w-px shrink-0 bg-white/15" aria-hidden />}
            {group.sliders.map((s) => (
              <ToolButton
                key={s.key}
                icon={ICONS[s.key]}
                unit={toUnit(s, recipe[s.key])}
                active={s.key === activeKey}
                label={`${t(`editor.groups.${group.id}`)} · ${t(`editor.adjust.${s.key}`)}`}
                onClick={(e) => {
                  setActiveKey(s.key);
                  e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
});

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

function ToolButton({
  icon: Icon,
  unit,
  active,
  label,
  onClick,
}: {
  icon: LucideIcon;
  unit: number;
  active: boolean;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative grid size-12 shrink-0 place-items-center rounded-full transition-colors",
        active ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {/* xoay −90° để bắt đầu từ 12 giờ; giá trị âm lật gương → chạy ngược chiều */}
      <svg
        viewBox="0 0 48 48"
        className="pointer-events-none absolute inset-0"
        style={{ transform: unit < 0 ? "scaleX(-1) rotate(-90deg)" : "rotate(-90deg)" }}
        aria-hidden
      >
        <circle cx="24" cy="24" r={RING_R} fill="none" strokeWidth="2" className="stroke-white/15" />
        {unit !== 0 && (
          <circle
            cx="24"
            cy="24"
            r={RING_R}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${Math.abs(unit) * RING_C} ${RING_C}`}
            className="stroke-white transition-[stroke-dasharray] duration-100"
          />
        )}
      </svg>
      <Icon className="size-5" />
    </button>
  );
}

const TRACK = 360; // px cho cả khoảng −1…1
const TICKS = 40;

/** Thước vạch: kéo ngang (chuột / chạm) hoặc phím mũi tên; kim giữa cố định, thước trượt. */
function Ruler({
  def,
  value,
  label,
  onPreview,
  onCommit,
}: {
  def: SliderDef;
  value: number;
  label: string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const drag = useRef<{ x: number; unit: number } | null>(null);
  const unit = toUnit(def, value);
  const at = (e: PointerEvent) => fromUnit(def, drag.current!.unit - (e.clientX - drag.current!.x) / (TRACK / 2));

  const onKeyDown = (e: KeyboardEvent) => {
    const step = def.step * (e.shiftKey ? 10 : 1);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? value + step
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? value - step
          : e.key === "Home" || e.key === "0"
            ? 0
            : null;
    if (next === null) return;
    e.preventDefault();
    onPreview(fromUnit(def, toUnit(def, next)));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      className="relative h-10 cursor-ew-resize touch-none overflow-hidden rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [mask-image:linear-gradient(90deg,transparent,#000_20%,#000_80%,transparent)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, unit };
      }}
      onPointerMove={(e) => drag.current && onPreview(at(e))}
      onPointerUp={(e) => {
        if (!drag.current) return;
        onCommit(at(e));
        drag.current = null;
      }}
      onPointerCancel={() => {
        if (drag.current) onCommit(value);
        drag.current = null;
      }}
      onKeyDown={onKeyDown}
      onKeyUp={() => onCommit(value)}
      onDoubleClick={() => onCommit(0)}
    >
      <div
        className="absolute inset-y-0 left-1/2"
        style={{ width: TRACK, transform: `translateX(${-TRACK / 2 - (unit * TRACK) / 2}px)` }}
      >
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const u = (i / TICKS) * 2 - 1;
          const lit = unit !== 0 && (unit > 0 ? u >= 0 && u <= unit : u <= 0 && u >= unit);
          return (
            <span
              key={i}
              className={cn(
                "absolute bottom-2 w-px -translate-x-1/2",
                i === TICKS / 2 ? "h-5" : i % 5 === 0 ? "h-4" : "h-2.5",
                lit ? "bg-white" : "bg-white/30",
              )}
              style={{ left: (i / TICKS) * TRACK }}
            />
          );
        })}
      </div>
      {/* kim giữa */}
      <span className="absolute bottom-1 left-1/2 h-8 w-0.5 -translate-x-1/2 rounded-full bg-foreground" aria-hidden />
    </div>
  );
}
