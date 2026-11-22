// Tóm tắt select.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabExperiment } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { HBars } from "@/features/lab/ui/charts";
import { useLabRunResults } from "@/features/lab/useLab";
import { selectSplits, v } from "@tng/shared/lab";
import { MUTED } from "../colors";

/** select: gộp mọi run chính thức (mỗi run chọn vài split) như build. */
export function LabSelectSummary({ experiment }: { experiment: LabExperiment }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.select.${key}`, opts ?? {});
  const runIds = experiment.runs.filter((x) => !x.smoke).map((x) => x.run_id);
  const { loading, runs } = useLabRunResults(experiment.exp, runIds);
  const splits = useMemo(() => selectSplits(runs), [runs]);
  if (loading) return <Skeleton className="h-96 rounded-xl bg-muted/40" />;
  if (!splits.length) return null;
  const total = splits.reduce((n, x) => n + (x.selected ?? 0), 0);

  return (
    <div className="space-y-8">
      <Step index={1} base="lab.digest.select.splits" params={{ total: v(total) }}>
        <TileGrid count={splits.length}>
          {splits.map((x) => (
            <StatTile
              key={x.split}
              tag={x.split}
              title={k("splits.selected")}
              value={v(x.selected)}
              sub={k("splits.sub", { candidates: v(x.candidates), rotated: v(x.rotated), run: x.runId })}
            />
          ))}
        </TileGrid>
        <ChartCard title={k("splits.chart")} caption={k("splits.caption")}>
          <HBars
            data={splits.map((x) => ({ label: x.split, minPos: x.minPos, medianPos: x.medianPos, p10Pos: x.p10Pos }))}
            perRow={60}
            labelWidth={90}
            legend
            series={[
              { key: "minPos", label: k("splits.min"), color: () => MUTED, opacity: 0.5 },
              { key: "p10Pos", label: "p10", color: () => "var(--foreground)", opacity: 0.55 },
              { key: "medianPos", label: k("splits.median"), color: () => "var(--foreground)" },
            ]}
          />
        </ChartCard>
      </Step>

      <Step index={2} base="lab.digest.select.short">
        <div className="grid gap-4 lg:grid-cols-3">
          {splits.map((x) => (
            <ChartCard key={x.split} title={`${x.split} · ${x.short.length}`}>
              {x.short.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {x.short.map((c) => (
                    <Badge key={c} variant="outline" className="font-normal">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{k("short.none")}</p>
              )}
            </ChartCard>
          ))}
        </div>
      </Step>
    </div>
  );
}
