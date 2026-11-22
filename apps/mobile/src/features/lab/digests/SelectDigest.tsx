// Tóm tắt select.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabExperiment } from "@tng/shared";
import { useLabRunResults } from "../useLab";
import { selectSplits, v } from "@tng/shared/lab";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { AdminBadge } from "@/features/admin/components/AdminUi";
import { ChartCard, HBars, StatTile, Step, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

/** select: gộp mọi run chính thức (mỗi run chọn vài split) như build. */
export function LabSelectSummary({ experiment }: { experiment: LabExperiment }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.select.${key}`, opts ?? {});
  const runIds = experiment.runs.filter((x) => !x.smoke).map((x) => x.run_id);
  const { loading, runs } = useLabRunResults(experiment.exp, runIds);
  const splits = useMemo(() => selectSplits(runs), [runs]);
  if (loading) return <Skeleton className="h-96 rounded-xl bg-muted/40" />;
  if (!splits.length) return null;
  const total = splits.reduce((n, x) => n + (x.selected ?? 0), 0);

  return (
    <View className="gap-8">
      <Step index={1} base="lab.digest.select.splits" params={{ total: v(total) }}>
        <TileGrid>
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
            legend
            series={[
              { key: "minPos", label: k("splits.min"), color: () => c.muted, opacity: 0.5 },
              { key: "p10Pos", label: "p10", color: () => c.foreground, opacity: 0.55 },
              { key: "medianPos", label: k("splits.median"), color: () => c.foreground },
            ]}
          />
        </ChartCard>
      </Step>

      <Step index={2} base="lab.digest.select.short">
        <View className="gap-4">
          {splits.map((x) => (
            <ChartCard key={x.split} title={`${x.split} · ${x.short.length}`}>
              {x.short.length ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {x.short.map((name) => (
                    <AdminBadge key={name} variant="outline" label={name} />
                  ))}
                </View>
              ) : (
                <Text className="text-xs text-muted-foreground">{k("short.none")}</Text>
              )}
            </ChartCard>
          ))}
        </View>
      </Step>
    </View>
  );
}
