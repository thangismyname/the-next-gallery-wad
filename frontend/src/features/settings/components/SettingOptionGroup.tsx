import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  /** `origin` = nút vừa bấm (vd. làm tâm hiệu ứng đổi theme). */
  onChange: (value: T, origin: HTMLElement) => void;
};

/** Nhóm nút chọn 1 trong N (segmented) dùng cho các cài đặt giao diện. */
export function SettingOptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map(({ value: v, label: optionLabel, icon: Icon }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={(e) => onChange(v, e.currentTarget)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-muted/50",
              )}
            >
              {Icon && <Icon className="size-4" />}
              {optionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
