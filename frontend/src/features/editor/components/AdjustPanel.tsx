import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { EditRecipe } from "@tng/shared";
import { SLIDER_GROUPS, type SliderDef } from "../recipe";

type Props = {
  recipe: EditRecipe;
  /** Đang kéo — chỉ vẽ lại, chưa vào lịch sử. */
  onPreview: (next: EditRecipe) => void;
  /** Thả tay / bàn phím / double-click = 1 bước undo. */
  onCommit: (next: EditRecipe) => void;
};

const format = ({ key }: SliderDef, value: number) =>
  key === "exposure" ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : `${value > 0 ? "+" : ""}${Math.round(value)}`;

/** Các thanh trượt theo nhóm (Ánh sáng · Màu · Hiệu ứng). Double-click 1 thanh = về 0. */
export const AdjustPanel = memo(function AdjustPanel({ recipe, onPreview, onCommit }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      {SLIDER_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-3">
          <h3 className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            {t(`editor.groups.${group.id}`)}
          </h3>
          {group.sliders.map((def) => {
            const value = recipe[def.key];
            const label = t(`editor.adjust.${def.key}`);
            const set = (v: number) => ({ ...recipe, [def.key]: v });
            return (
              <label key={def.key} className="flex flex-col gap-1.5" onDoubleClick={() => onCommit(set(0))}>
                <span className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className={value === 0 ? "text-muted-foreground tabular-nums" : "font-medium tabular-nums"}>
                    {format(def, value)}
                  </span>
                </span>
                <input
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={value}
                  aria-label={label}
                  className="h-1.5 w-full cursor-pointer accent-primary"
                  onChange={(e) => onPreview(set(Number(e.target.value)))}
                  // pointer / phím mũi tên xong → chốt 1 bước lịch sử
                  onPointerUp={(e) => onCommit(set(Number(e.currentTarget.value)))}
                  onKeyUp={(e) => onCommit(set(Number(e.currentTarget.value)))}
                />
              </label>
            );
          })}
        </section>
      ))}
    </div>
  );
});
