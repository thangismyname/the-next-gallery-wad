// Tóm tắt E6.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { ciTone, e6ByMode, e6Clip, e6Pairwise, fmt, pick, searchGain, signed, v } from "@tng/shared/lab";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ChartCard, CiLegend, CiTable, DeltaBars, KindLegend, StatTile, Step, Swatches, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

/** Δ theo nguồn: oracle (trần) xám, còn lại màu nguồn; nhãn oracle thêm "(trần)". */
const gainRows = (rows: ReturnType<typeof searchGain>, ceiling: string, c: ReturnType<typeof useLabColors>) =>
  rows.map((g) => ({
    label: g.ceiling ? `${g.label} (${ceiling})` : g.label,
    delta: g.delta,
    color: g.ceiling ? c.muted : c.of(g.label),
  }));

export function LabE6Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e6.${key}`, opts ?? {});
  const ceiling = t("lab.overview.ceiling");
  const r = run.result;
  const capGain = gainRows(searchGain(r, "captions", "MRR"), ceiling, c);
  const capMode = useMemo(() => e6ByMode(r, "captions", "MRR"), [r]);
  const compGain = gainRows(searchGain(r, "compositional", "P@10"), ceiling, c);
  const compMode = useMemo(() => e6ByMode(r, "compositional", "P@10"), [r]);
  const capPairs = useMemo(() => e6Pairwise(r, "captions"), [r]);
  const compPairs = useMemo(() => e6Pairwise(r, "compositional"), [r]);
  const ciLegend = <CiLegend kinds={["clip", "yolo", "dino", "fusion"]} />;
  const modeColor = (d?: number) => ((d ?? 0) >= 0 ? c.tone("fusion") : c.fail);
  const modeLegend = (
    <Swatches
      items={[
        { color: c.tone("fusion"), label: k("modes.better") },
        { color: c.fail, label: k("modes.worse") },
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
    <View className="gap-8">
      {capGain.length > 0 && (
        <Step index={1} base="lab.digest.e6.captions" params={{ queries: v(pick(r, "captions.queries")) }}>
          <TileGrid>
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
          <View className="gap-4">
            <View>
              <ChartCard title={k("captions.chart")} caption={k("captions.caption")} legend={<KindLegend kinds={["clip", "yolo", "dino", "fusion", "reference"]} />}>
                <DeltaBars data={capGain} />
              </ChartCard>
            </View>
            <ChartCard title={k("modes.chart")} caption={k("modes.caption")} legend={modeLegend}>
              <DeltaBars
                data={capMode.map((m) => ({ ...m, color: modeColor(m.delta) }))}
               
              />
            </ChartCard>
          </View>
        </Step>
      )}

      {compGain.length > 0 && (
        <Step index={2} base="lab.digest.e6.compositional" params={{ queries: v(pick(r, "compositional.queries")) }}>
          <View className="gap-4">
            <View>
              <ChartCard title={k("compositional.chart")} caption={k("compositional.caption")} legend={<KindLegend kinds={["clip", "yolo", "dino", "fusion", "reference"]} />}>
                <DeltaBars data={compGain} />
              </ChartCard>
            </View>
            <View className="gap-4">
              {unjudged != null && (
                <TileGrid>
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
                 
                />
              </ChartCard>
            </View>
          </View>
        </Step>
      )}

      {(capPairs.length > 0 || compPairs.length > 0) && (
        <Step index={3} base="lab.digest.e6.pairwise">
          {/* full width: tên cặp dài (vd "boost_prob:fused_learned_ft − boost_prob:fused_learned") */}
          <View className="gap-4">
            {[
              { id: "captions", rows: capPairs },
              { id: "compositional", rows: compPairs },
            ]
              .filter((x) => x.rows.length)
              .map(({ id, rows }) => (
                <ChartCard key={id} title={k(`pairwise.${id}`, { metric: rows[0].metric })} caption={k("pairwise.caption")} legend={ciLegend}>
                  <View className="gap-4">
                    <DeltaBars
                      data={rows.map((p) => ({ label: p.label, delta: p.delta, tone: ciTone(p) }))}
                    />
                    <CiTable rows={rows} />
                  </View>
                </ChartCard>
              ))}
          </View>
          {edges.length > 0 && (
            <Text className="text-xs text-muted-foreground">
              {k("pairwise.lambdaEdge", { list: edges.join(", ") })}
            </Text>
          )}
        </Step>
      )}
    </View>
  );
}
