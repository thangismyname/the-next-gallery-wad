// Tóm tắt build.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabExperiment } from "@tng/shared";
import { useLabRunResults } from "../useLab";
import { buildSplits, fmt } from "@tng/shared/lab";
import { View } from "react-native";
import { ChartCard, HBars, StatTile, StepHeader, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

const pct = (v: number) => `${fmt("pct", v)}%`;

/** build: gộp mọi run chính thức (mỗi run dựng vài split) → sức khoẻ dữ liệu + độ phủ annotation theo split. */
export function LabBuildSummary({ experiment }: { experiment: LabExperiment }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.build.${key}`, opts ?? {});
  const runIds = experiment.runs.filter((r) => !r.smoke).map((r) => r.run_id);
  const { loading, runs } = useLabRunResults(experiment.exp, runIds);
  const splits = useMemo(() => buildSplits(runs), [runs]);
  if (loading) return <Skeleton className="h-96 rounded-xl bg-muted/40" />;
  if (!splits.length) return null;

  const total = splits.reduce((n, s) => n + s.images, 0);
  const rows = splits.map((s) => ({ ...s, label: s.split }));

  return (
    <View className="gap-8">
      <View className="gap-3">
        <StepHeader index={1} title={k("health.title")} question={k("health.question", { total: fmt("value", total) })} />
        <TileGrid>
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
      </View>

      <View className="gap-3">
        <StepHeader index={2} title={k("labels.title")} question={k("labels.question")} />
        <View className="gap-4">
          <ChartCard title={k("labels.pairs.title")} caption={k("labels.pairs.caption")}>
            <HBars
              data={rows}
              legend
              series={[
                { key: "knownPairs", label: k("labels.pairs.known"), color: () => c.tone("reference"), opacity: 0.5 },
                { key: "positivePairs", label: k("labels.pairs.positive"), color: () => c.foreground },
              ]}
            />
          </ChartCard>
          <ChartCard title={k("labels.coverage.title")} caption={k("labels.coverage.caption")}>
            <HBars
              data={rows}
              domain={[0, 100]}
              legend
              series={[
                { key: "boxesPct", label: k("labels.coverage.boxes"), color: () => c.tone("yolo"), format: pct },
                { key: "captionsPct", label: k("labels.coverage.captions"), color: () => c.tone("clip"), format: pct },
              ]}
            />
          </ChartCard>
        </View>
        <TileGrid>
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
      </View>
    </View>
  );
}
