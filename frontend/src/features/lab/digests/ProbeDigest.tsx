// Tóm tắt probe.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { CiTable } from "@/features/lab/ui/CiTable";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { DeltaBars, HBars } from "@/features/lab/ui/charts";
import { CiLegend, KindLegend } from "@/features/lab/ui/legends";
import { ciTone, pick, probeBySet, probeSelected, probeSteps, signed, tagLadder, v } from "@tng/shared/lab";
import { KIND_COLOR, colorOf } from "../colors";

const PROBE_SET_CONFIGS = [
  { key: "zs_clip", color: KIND_COLOR.clip, opacity: 0.4 },
  { key: "lp_clip", color: KIND_COLOR.clip },
  { key: "e5_per_tag", color: KIND_COLOR.fusion, opacity: 0.4 },
  { key: "fused_learned", color: KIND_COLOR.fusion },
];

export function LabProbeSummary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.probe.${key}`, opts ?? {});
  const s = (key: string) => t(`lab.overview.series.${key}`);
  const r = run.result;
  const ladder = useMemo(() => tagLadder(r), [r]);
  const steps = useMemo(() => probeSteps(r, "macro_f1_at_precision"), [r]);
  const bySet = useMemo(() => probeBySet(r, PROBE_SET_CONFIGS.map((c) => c.key), "macro_f1_at_precision"), [r]);
  const selected = useMemo(() => probeSelected(r), [r]);
  if (!ladder.length) return null;
  const best = [...ladder].filter((x) => x.label !== "zs_clip" && x.label !== "e5_per_tag").sort((a, b) => (b.mAP ?? 0) - (a.mAP ?? 0))[0];
  const zs = ladder.find((x) => x.label === "zs_clip");

  return (
    <div className="space-y-8">
      <Step index={1} base="lab.digest.probe.ladder" params={{ images: v(pick(r, "train_images")), target: v(pick(r, "precision_target")) }}>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <TileGrid count={3} stacked>
            <StatTile
              tag={best?.label}
              title={k("ladder.best")}
              value={v(best?.mAP)}
              sub={k("ladder.bestSub", { delta: signed(best?.mAP != null && zs?.mAP != null ? best.mAP - zs.mAP : undefined) })}
            />
            <StatTile
              tag={best?.label}
              title={k("ladder.f1p")}
              value={v(best?.f1p)}
              sub={k("ladder.f1pSub", { zs: v(zs?.f1p) })}
            />
            <StatTile tag="ECE" title={k("ladder.ece")} value={v(pick(r, `test_all_classes.${best?.label}.ece`))} sub={k("ladder.eceSub", { zs: v(pick(r, "test_all_classes.zs_clip.ece")) })} />
          </TileGrid>
          <div className="lg:col-span-2">
            <ChartCard
              title={t("lab.overview.charts.ladder.title")}
              caption={t("lab.overview.charts.ladder.caption")}
              legend={<KindLegend kinds={["clip", "dino", "fusion"]} />}
            >
              <HBars
                data={ladder}
                perRow={40}
                domain={[0, 1]}
                series={[
                  { key: "f1p", label: s("f1p"), color: (row) => colorOf(row.label) },
                  { key: "mAP", label: s("mAP"), color: (row) => colorOf(row.label), opacity: 0.35 },
                ]}
              />
            </ChartCard>
          </div>
        </div>
      </Step>

      {steps.length > 0 && (
        <Step index={2} base="lab.digest.probe.steps">
          <ChartCard title={k("steps.chart")} caption={k("steps.caption")} legend={<CiLegend kinds={["clip", "dino", "fusion"]} />}>
            <div className="space-y-4">
              <DeltaBars
                data={steps.map((p) => ({ label: p.label, delta: p.delta, tone: ciTone(p) }))}
                label="Δ macro-F1@P"
                perRow={32}
                labelWidth={200}
              />
              <CiTable rows={steps} />
            </div>
          </ChartCard>
        </Step>
      )}

      {bySet.length > 0 && (
        <Step index={3} base="lab.digest.probe.sets">
          <ChartCard title={k("sets.chart")} caption={k("sets.caption")}>
            <HBars
              data={bySet}
              perRow={60}
              labelWidth={110}
              domain={[0, 1]}
              legend
              series={PROBE_SET_CONFIGS.map((c) => ({ key: c.key, label: c.key, color: () => c.color, opacity: c.opacity }))}
            />
          </ChartCard>
        </Step>
      )}

      {selected.length > 0 && (
        <Step index={4} base="lab.digest.probe.selected">
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  <th className="px-4 py-2 text-left font-normal">config</th>
                  <th className="px-4 py-2 text-right font-normal">L2</th>
                  <th className="px-4 py-2 text-right font-normal">unknown_weight</th>
                  <th className="px-4 py-2 text-right font-normal">val mAP</th>
                  <th className="px-4 py-2 text-right font-normal" />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {selected.map((x) => (
                  <tr key={x.config} className="border-t border-border/40">
                    <td className="px-4 py-1.5 font-mono text-xs">{x.config}</td>
                    <td className="px-4 py-1.5 text-right">{v(x.l2)}</td>
                    <td className="px-4 py-1.5 text-right">{v(x.unknownWeight)}</td>
                    <td className="px-4 py-1.5 text-right">{v(x.valMAP)}</td>
                    <td className="px-4 py-1.5 text-right">
                      {x.gridEdge.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {k("selected.edge", { params: x.gridEdge.join(", ") })}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>
      )}
    </div>
  );
}
