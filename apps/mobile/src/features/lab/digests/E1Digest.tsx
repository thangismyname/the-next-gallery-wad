// Tóm tắt E1.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { e1Checks, e1Datasets, e1DeltaRows, e1PipelineDeltas, e1Recall, e1Tolerance, fmt } from "@tng/shared/lab";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ChartCard, DeltaBars, StatTile, StepHeader, TileGrid, ToleranceLegend } from "../ui";
import { useLabColors } from "../labColors";

/** e1: 4 phép chấm R@1 vs paper (Δ, dải ±tolerance) · pipeline app làm R@1 đổi bao nhiêu · bảng Recall@K. */
export function LabE1Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e1.${key}`, opts ?? {});
  const tolerance = e1Tolerance(run.config);
  const checks = useMemo(() => e1Checks(run.result, tolerance), [run.result, tolerance]);
  const deltaRows = useMemo(() => e1DeltaRows(run.result, tolerance), [run.result, tolerance]);
  const pipeline = e1PipelineDeltas(run.result).map((d) => ({
    label: `${d.dataset} ${d.dir} · ${k(`pipeline.variants.${d.variant}`)}`,
    delta: d.delta,
    color: c.tone("clip"),
  }));
  const recall = useMemo(
    () => e1Datasets(run.result).flatMap((d) => e1Recall(run.result, d).map((r) => ({ ...r, dataset: d }))),
    [run.result],
  );
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.pass).length;

  return (
    <View className="gap-8">

      <View className="gap-3">
        <StepHeader
          index={1}
          title={k("checks.title")}
          question={k("checks.question", { tol: tolerance, passed, total: checks.length })}
        />
        <View className="gap-4">
          <TileGrid>
            {checks.map((c) => (
              <StatTile
                key={`${c.dataset}-${c.dir}`}
                tag={`${c.dataset} · ${c.dir}`}
                title={k(`checks.${c.dir}`)}
                value={c.ours == null ? "—" : fmt("value", c.ours)}
                pass={c.pass}
                sub={k("checks.sub", { paper: fmt("value", c.paper), delta: fmt("delta", c.delta) })}
              />
            ))}
          </TileGrid>
          <View>
            <ChartCard
              title={k("checks.chart")}
              caption={k("checks.caption", { tol: tolerance })}
              legend={<ToleranceLegend tol={tolerance} />}
            >
              <DeltaBars data={deltaRows} tolerance={tolerance} />
            </ChartCard>
          </View>
        </View>
      </View>

      {pipeline.length > 0 && (
        <View className="gap-3">
          <StepHeader index={2} title={k("pipeline.title")} question={k("pipeline.question")} />
          <ChartCard title={k("pipeline.chart")} caption={k("pipeline.caption", { tol: tolerance })}>
            <DeltaBars data={pipeline} tolerance={tolerance} />
          </ChartCard>
        </View>
      )}

      <View className="gap-3">
        <StepHeader index={3} title={k("recall.title")} question={k("recall.question")} />
        {/* Bảng web → lưới View: dataset · chỉ số · đo được · paper · Δ */}
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          <View className="flex-row px-3 py-2">
            {(["dataset", "metric", "ours", "paper", "delta"] as const).map((col, i) => (
              <Text key={col} className={i < 2 ? "flex-1 text-[10px] uppercase text-muted-foreground" : "w-14 text-right text-[10px] uppercase text-muted-foreground"}>
                {k(`recall.cols.${col}`)}
              </Text>
            ))}
          </View>
          {recall.map((r) => {
            const delta = r.ours != null && r.paper != null ? r.ours - r.paper : undefined;
            return (
              <View key={`${r.dataset}-${r.label}`} className="flex-row border-t border-border px-3 py-1.5">
                <Text className="flex-1 text-xs">{r.dataset}</Text>
                <Text className="flex-1 text-xs">{r.label}</Text>
                <Text className="w-14 text-right text-xs tabular-nums">{fmt("value", r.ours) || "—"}</Text>
                <Text className="w-14 text-right text-xs tabular-nums text-muted-foreground">{fmt("value", r.paper) || "—"}</Text>
                <Text className="w-14 text-right text-xs tabular-nums">{delta == null ? "—" : fmt("delta", delta)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
