import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabExperiment } from "@tng/shared";
import { useLabHistory, useLabLatestResults } from "./useLab";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { StepHeader } from "@/features/lab/ui/Step";
import { DeltaBars, HBars } from "@/features/lab/ui/charts";
import { KindLegend, ToleranceLegend } from "@/features/lab/ui/legends";
import { Kpi, OVERVIEW_GROUPS, buildKpis, e1DeltaRows, e1Tolerance, fmt, fusionStrategies, searchGain, tagLadder } from "@tng/shared/lab";
import { KIND_COLOR, colorOf } from "./colors";

/** Tab Tổng quan: chỉ số chính + chart, gom theo 4 bước của luận văn; màu chart = nguồn AI. */
export function LabOverview({
  experiments,
  onOpen,
}: {
  experiments: LabExperiment[];
  onOpen: (exp: string) => void;
}) {
  const { t } = useTranslation();
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
    column
      ? (summary.data?.rows ?? []).map((r) => r[column]).filter((v): v is number => typeof v === "number")
      : [];

  const charts: Record<string, { exp: string; legend: React.ReactNode; node: React.ReactNode } | null> = {
    paper: paper.length
      ? {
          exp: "e1",
          legend: <ToleranceLegend tol={tolerance} />,
          node: (
            <DeltaBars data={paper} label={s("deltaR1")} tolerance={tolerance} perRow={36} labelWidth={110} />
          ),
        }
      : null,
    fusion: fusion.length
      ? {
          exp: "e5",
          legend: <KindLegend kinds={["clip", "yolo", "fusion"]} />,
          node: (
            <HBars
              data={fusion}
              domain={[0, 1]}
              series={[{ key: "value", label: s("macro_f1"), color: (r) => colorOf(r.label) }]}
            />
          ),
        }
      : null,
    ladder: ladder.length
      ? {
          exp: "probe",
          legend: <KindLegend kinds={["clip", "dino", "fusion"]} />,
          node: (
            <HBars
              data={ladder}
              perRow={40}
              domain={[0, 1]}
              series={[
                { key: "f1p", label: s("f1p"), color: (r) => colorOf(r.label) },
                { key: "mAP", label: s("mAP"), color: (r) => colorOf(r.label), opacity: 0.35 },
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
            <HBars
              data={gain.map((g) => ({
                ...g,
                label: g.ceiling ? `${g.label} (${t("lab.overview.ceiling")})` : g.label,
              }))}
              perRow={24}
              labelWidth={130}
              series={[
                {
                  key: "delta",
                  label: s("delta"),
                  color: (r) => (r.ceiling ? KIND_COLOR.reference : colorOf(r.label)),
                  format: (v) => fmt("delta", v),
                },
              ]}
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
        onClick={() => onOpen(kpi.id)}
      />
    );
  };

  if (loading) return <Skeleton className="h-[32rem] rounded-xl bg-muted/40" />;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("lab.overview.intro")}</p>

      {OVERVIEW_GROUPS.map((group, i) => {
        const tiles = group.kpis.map((id) => kpis.get(id)).filter((k): k is Kpi => Boolean(k));
        const groupCharts = group.charts.map((id) => ({ id, chart: charts[id] })).filter((c) => c.chart);
        const grid = (
          <TileGrid count={tiles.length} stacked={groupCharts.length > 0}>
            {tiles.map(tile)}
          </TileGrid>
        );
        return (
          <section key={group.id} className="space-y-3">
            <StepHeader
              index={i + 1}
              title={t(`lab.overview.groups.${group.id}.title`)}
              question={t(`lab.overview.groups.${group.id}.question`)}
            />
            {groupCharts.length ? (
              <div className="grid items-start gap-4 lg:grid-cols-3">
                {grid}
                <div className="space-y-4 lg:col-span-2">
                  {groupCharts.map(({ id, chart }) => (
                    <ChartCard
                      key={id}
                      title={t(`lab.overview.charts.${id}.title`)}
                      caption={t(`lab.overview.charts.${id}.caption`)}
                      onOpen={() => onOpen(chart!.exp)}
                      legend={chart!.legend}
                    >
                      {chart!.node}
                    </ChartCard>
                  ))}
                </div>
              </div>
            ) : (
              grid
            )}
          </section>
        );
      })}
    </div>
  );
}
