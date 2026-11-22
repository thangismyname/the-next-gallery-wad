// Tóm tắt build.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabExperiment } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { StepHeader } from "@/features/lab/ui/Step";
import { HBars } from "@/features/lab/ui/charts";
import { useLabRunResults } from "@/features/lab/useLab";
import { buildSplits, fmt } from "@tng/shared/lab";
import { KIND_COLOR } from "../colors";

const pct = (v: number) => `${fmt("pct", v)}%`;

/** build: gộp mọi run chính thức (mỗi run dựng vài split) → sức khoẻ dữ liệu + độ phủ annotation theo split. */
export function LabBuildSummary({ experiment }: { experiment: LabExperiment }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.build.${key}`, opts ?? {});
  const runIds = experiment.runs.filter((r) => !r.smoke).map((r) => r.run_id);
  const { loading, runs } = useLabRunResults(experiment.exp, runIds);
  const splits = useMemo(() => buildSplits(runs), [runs]);
  if (loading) return <Skeleton className="h-96 rounded-xl bg-muted/40" />;
  if (!splits.length) return null;

  const total = splits.reduce((n, s) => n + s.images, 0);
  const rows = splits.map((s) => ({ ...s, label: s.split }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <StepHeader index={1} title={k("health.title")} question={k("health.question", { total: fmt("value", total) })} />
        <TileGrid count={splits.length}>
          {splits.map((s) => (
            <StatTile
              key={s.split}
              tag={s.split}
              title={k("health.images")}
              value={fmt("value", s.images)}
              pass={s.problems === 0}
              sub={k("health.sub", { missing: s.missing, broken: s.broken, rotated: s.rotated, run: s.runId })}
            />
          ))}
        </TileGrid>
      </section>

      <section className="space-y-3">
        <StepHeader index={2} title={k("labels.title")} question={k("labels.question")} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ChartCard title={k("labels.pairs.title")} caption={k("labels.pairs.caption")}>
            <HBars
              data={rows}
              perRow={44}
              labelWidth={90}
              legend
              series={[
                { key: "knownPairs", label: k("labels.pairs.known"), color: () => KIND_COLOR.reference, opacity: 0.5 },
                { key: "positivePairs", label: k("labels.pairs.positive"), color: () => "var(--foreground)" },
              ]}
            />
          </ChartCard>
          <ChartCard title={k("labels.coverage.title")} caption={k("labels.coverage.caption")}>
            <HBars
              data={rows}
              perRow={44}
              labelWidth={90}
              domain={[0, 100]}
              legend
              series={[
                { key: "boxesPct", label: k("labels.coverage.boxes"), color: () => KIND_COLOR.yolo, format: pct },
                { key: "captionsPct", label: k("labels.coverage.captions"), color: () => KIND_COLOR.clip, format: pct },
              ]}
            />
          </ChartCard>
        </div>
        <TileGrid count={splits.length}>
          {splits.map((s) => (
            <StatTile
              key={s.split}
              tag={s.split}
              title={k("labels.rate")}
              value={pct(s.positiveRate)}
              sub={k("labels.rateSub", { groupOf: fmt("value", s.groupOfBoxes) })}
            />
          ))}
        </TileGrid>
      </section>
    </div>
  );
}
