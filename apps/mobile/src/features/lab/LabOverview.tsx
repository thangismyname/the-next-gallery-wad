// Tab Tổng quan của Lab trên mobile (web `features/lab/LabOverview`): 8 chỉ số chính theo 4 bước luận văn
// + 4 biểu đồ; bấm thẻ / "Xem chi tiết" mở experiment đó. Dữ liệu dùng chung @tng/shared/lab.
import type { LabExperiment } from "@tng/shared";
import {
  buildKpis,
  e1DeltaRows,
  e1Tolerance,
  fmt,
  fusionStrategies,
  type Kpi,
  OVERVIEW_GROUPS,
  searchGain,
  tagLadder,
} from "@tng/shared/lab";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

import { useLabColors } from "./labColors";
import { ChartCard, DeltaBars, HBars, KindLegend, StatTile, StepHeader, TileGrid, ToleranceLegend } from "./ui";
import { useLabHistory, useLabLatestResults } from "./useLab";

export function LabOverview({ experiments, onOpen }: { experiments: LabExperiment[]; onOpen: (exp: string) => void }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const { loading, results, configs } = useLabLatestResults(experiments);
  const tolerance = e1Tolerance(configs.e1);
  const summary = useLabHistory("summary");
  const kpis = useMemo(() => new Map(buildKpis(results).map((k) => [k.id, k])), [results]);
  const ladder = useMemo(() => tagLadder(results.probe), [results.probe]);
  const gain = useMemo(() => searchGain(results.e6), [results.e6]);
  const fusion = useMemo(() => fusionStrategies(results.e5), [results.e5]);
  const paper = useMemo(() => e1DeltaRows(results.e1, tolerance), [results.e1, tolerance]);
  const s = (key: string) => t(`lab.overview.series.${key}`);

  const sparkOf = (column?: string) =>
    column ? (summary.data?.rows ?? []).map((r) => r[column]).filter((v): v is number => typeof v === "number") : [];

  const charts: Record<string, { exp: string; legend: ReactNode; node: ReactNode } | null> = {
    paper: paper.length
      ? { exp: "e1", legend: <ToleranceLegend tol={tolerance} />, node: <DeltaBars data={paper} tolerance={tolerance} /> }
      : null,
    fusion: fusion.length
      ? {
          exp: "e5",
          legend: <KindLegend kinds={["clip", "yolo", "fusion"]} />,
          node: <HBars data={fusion} domain={[0, 1]} series={[{ key: "value", label: s("macro_f1"), color: (r) => c.of(r.label) }]} />,
        }
      : null,
    ladder: ladder.length
      ? {
          exp: "probe",
          legend: <KindLegend kinds={["clip", "dino", "fusion"]} />,
          node: (
            <HBars
              data={ladder}
              domain={[0, 1]}
              series={[
                { key: "f1p", label: s("f1p"), color: (r) => c.of(r.label) },
                { key: "mAP", label: s("mAP"), color: (r) => c.of(r.label), opacity: 0.35 },
              ]}
            />
          ),
        }
      : null,
    search: gain.length
      ? {
          exp: "e6",
          legend: <KindLegend kinds={["clip", "yolo", "dino", "fusion", "reference"]} />,
          node: (
            <DeltaBars
              data={gain.map((g) => ({
                label: g.ceiling ? `${g.label} (${t("lab.overview.ceiling")})` : g.label,
                delta: g.delta,
                color: g.ceiling ? c.muted : c.of(g.label),
              }))}
            />
          ),
        }
      : null,
  };

  const tile = (kpi: Kpi) => {
    const base = `lab.overview.kpi.${kpi.id}`;
    const complete = Object.values(kpi.params).every((v) => v != null);
    const params = Object.fromEntries(Object.entries(kpi.params).map(([k, v]) => [k, fmt(k, v)]));
    return (
      <StatTile
        key={kpi.id}
        tag={kpi.id}
        title={t(`${base}.title`)}
        value={kpi.value == null ? "—" : fmt("value", kpi.value)}
        sub={kpi.value == null ? t("lab.overview.noRun") : complete ? t(`${base}.sub`, params) : null}
        pass={kpi.pass}
        spark={sparkOf(kpi.spark)}
        onPress={() => onOpen(kpi.id)}
      />
    );
  };

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <View className="gap-8">
      <Text className="text-sm text-muted-foreground">{t("lab.overview.intro")}</Text>
      {OVERVIEW_GROUPS.map((group, i) => {
        const tiles = group.kpis.map((id) => kpis.get(id)).filter((k): k is Kpi => Boolean(k));
        return (
          <View key={group.id} className="gap-3">
            <StepHeader
              index={i + 1}
              title={t(`lab.overview.groups.${group.id}.title`)}
              question={t(`lab.overview.groups.${group.id}.question`)}
            />
            <TileGrid>{tiles.map(tile)}</TileGrid>
            {group.charts.map((id) => {
              const chart = charts[id];
              return chart ? (
                <ChartCard
                  key={id}
                  title={t(`lab.overview.charts.${id}.title`)}
                  caption={t(`lab.overview.charts.${id}.caption`)}
                  legend={chart.legend}
                  onOpen={() => onOpen(chart.exp)}
                >
                  {chart.node}
                </ChartCard>
              ) : null;
            })}
          </View>
        );
      })}
    </View>
  );
}
