// Tóm tắt E6.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { CiTable } from "@/features/lab/ui/CiTable";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { DeltaBars } from "@/features/lab/ui/charts";
import { CiLegend, KindLegend, Swatches } from "@/features/lab/ui/legends";
import { ciTone, e6ByMode, e6Clip, e6Pairwise, fmt, pick, searchGain, signed, v } from "@tng/shared/lab";
import { FAIL_COLOR, KIND_COLOR, MUTED, colorOf } from "../colors";

/** Δ theo nguồn: oracle (trần) xám, còn lại màu nguồn; nhãn oracle thêm "(trần)". */
const gainRows = (rows: ReturnType<typeof searchGain>, ceiling: string) =>
  rows.map((g) => ({
    label: g.ceiling ? `${g.label} (${ceiling})` : g.label,
    delta: g.delta,
    color: g.ceiling ? MUTED : colorOf(g.label),
  }));

export function LabE6Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e6.${key}`, opts ?? {});
  const ceiling = t("lab.overview.ceiling");
  const r = run.result;
  const capGain = useMemo(() => gainRows(searchGain(r, "captions", "MRR"), ceiling), [r, ceiling]);
  const capMode = useMemo(() => e6ByMode(r, "captions", "MRR"), [r]);
  const compGain = useMemo(() => gainRows(searchGain(r, "compositional", "P@10"), ceiling), [r, ceiling]);
  const compMode = useMemo(() => e6ByMode(r, "compositional", "P@10"), [r]);
  const capPairs = useMemo(() => e6Pairwise(r, "captions"), [r]);
  const compPairs = useMemo(() => e6Pairwise(r, "compositional"), [r]);
  const ciLegend = <CiLegend kinds={["clip", "yolo", "dino", "fusion"]} />;
  const modeColor = (d?: number) => ((d ?? 0) >= 0 ? KIND_COLOR.fusion : FAIL_COLOR);
  const modeLegend = (
    <Swatches
      items={[
        { color: KIND_COLOR.fusion, label: k("modes.better") },
        { color: FAIL_COLOR, label: k("modes.worse") },
      ]}
    />
  );


  const clip = e6Clip(r, "captions", "MRR");
  const gains = searchGain(r, "captions", "MRR");
  const best = gains.find((g) => !g.ceiling);
  const oracle = gains.find((g) => g.ceiling);
  const unjudged = pick(r, "compositional.unjudged_pairs");
  const edges = Array.isArray((r as { lambda_at_grid_edge?: unknown })?.lambda_at_grid_edge)
    ? ((r as { lambda_at_grid_edge: string[] }).lambda_at_grid_edge)
    : [];
  if (!capGain.length && !compGain.length) return null;

  return (
    <div className="space-y-8">
      {capGain.length > 0 && (
        <Step index={1} base="lab.digest.e6.captions" params={{ queries: v(pick(r, "captions.queries")) }}>
          <TileGrid count={4}>
            <StatTile tag="clip" title={k("captions.clip")} value={v(clip)} sub={k("captions.clipSub")} />
            <StatTile
              tag={best ? `${best.mode}:${best.label}` : "best"}
              title={k("captions.best")}
              value={v(best && clip != null ? clip + best.delta : undefined)}
              sub={k("captions.bestSub", { delta: signed(best?.delta) })}
            />
            <StatTile
              tag="oracle"
              title={k("captions.oracle")}
              value={v(oracle && clip != null ? clip + oracle.delta : undefined)}
              sub={k("captions.oracleSub")}
            />
            <StatTile
              tag="gap"
              title={k("captions.gap")}
              value={best && oracle && oracle.delta > 0 ? `${fmt("pct", (best.delta / oracle.delta) * 100)}%` : "—"}
              sub={k("captions.gapSub")}
            />
          </TileGrid>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title={k("captions.chart")} caption={k("captions.caption")} legend={<KindLegend kinds={["clip", "yolo", "dino", "fusion", "reference"]} />}>
                <DeltaBars data={capGain} label="Δ MRR" perRow={24} labelWidth={150} />
              </ChartCard>
            </div>
            <ChartCard title={k("modes.chart")} caption={k("modes.caption")} legend={modeLegend}>
              <DeltaBars
                data={capMode.map((m) => ({ ...m, color: modeColor(m.delta) }))}
                label="Δ MRR"
                perRow={40}
                labelWidth={90}
              />
            </ChartCard>
          </div>
        </Step>
      )}

      {compGain.length > 0 && (
        <Step index={2} base="lab.digest.e6.compositional" params={{ queries: v(pick(r, "compositional.queries")) }}>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title={k("compositional.chart")} caption={k("compositional.caption")} legend={<KindLegend kinds={["clip", "yolo", "dino", "fusion", "reference"]} />}>
                <DeltaBars data={compGain} label="Δ P@10" perRow={24} labelWidth={150} />
              </ChartCard>
            </div>
            <div className="space-y-4">
              {unjudged != null && (
                <TileGrid count={1} stacked>
                  <StatTile
                    tag="judge.html"
                    title={k("compositional.unjudged")}
                    value={v(unjudged)}
                    pass={unjudged === 0}
                    sub={k("compositional.unjudgedSub")}
                  />
                </TileGrid>
              )}
              <ChartCard title={k("modes.chart")} legend={modeLegend}>
                <DeltaBars
                  data={compMode.map((m) => ({ ...m, color: modeColor(m.delta) }))}
                  label="Δ P@10"
                  perRow={40}
                  labelWidth={90}
                />
              </ChartCard>
            </div>
          </div>
        </Step>
      )}

      {(capPairs.length > 0 || compPairs.length > 0) && (
        <Step index={3} base="lab.digest.e6.pairwise">
          {/* full width: tên cặp dài (vd "boost_prob:fused_learned_ft − boost_prob:fused_learned") */}
          <div className="space-y-4">
            {[
              { id: "captions", rows: capPairs },
              { id: "compositional", rows: compPairs },
            ]
              .filter((x) => x.rows.length)
              .map(({ id, rows }) => (
                <ChartCard key={id} title={k(`pairwise.${id}`, { metric: rows[0].metric })} caption={k("pairwise.caption")} legend={ciLegend}>
                  <div className="space-y-4">
                    <DeltaBars
                      data={rows.map((p) => ({ label: p.label, delta: p.delta, tone: ciTone(p) }))}
                      label={`Δ ${rows[0].metric}`}
                      perRow={26}
                      labelWidth={340}
                    />
                    <CiTable rows={rows} />
                  </div>
                </ChartCard>
              ))}
          </div>
          {edges.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {k("pairwise.lambdaEdge", { list: edges.join(", ") })}
            </p>
          )}
        </Step>
      )}
    </div>
  );
}
