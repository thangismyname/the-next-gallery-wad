import { useTranslation } from "react-i18next";
import { AI_BAR, type AiSource } from "@/lib/aiColors";
import { cn } from "@/lib/utils";
import type { AiCoverage } from "@/types";

const PIPELINES: { key: keyof AiCoverage["done"]; source: AiSource }[] = [
  { key: "tags", source: "tag" },
  { key: "clip", source: "clip" },
  { key: "yolo", source: "yolo" },
  { key: "dino", source: "dino" },
];

/** Tiến độ 4 pipeline AI (đã xử lý / tổng ảnh) — màu theo nguồn AI. */
export function AiCoverageBars({ coverage }: { coverage: AiCoverage }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3">
      {PIPELINES.map(({ key, source }) => {
        const done = coverage.done[key];
        const percent = coverage.total
          ? Math.round((done / coverage.total) * 100)
          : 0;
        return (
          <li key={key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <span className={cn("size-2 rounded-full", AI_BAR[source])} />
                {t(`settings.ai.${key}.name`)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {done}/{coverage.total} · {percent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", AI_BAR[source])}
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
