// Tóm tắt E3.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { HBars, Lines } from "@/features/lab/ui/charts";
import { compositionalTone, e3Captions, e3Compositional, e3Groups, e3PrecisionCurve, pick, v } from "@tng/shared/lab";
import { KIND_COLOR, toneColor } from "../colors";

const CLIP = KIND_COLOR.clip;

const SECOND = "var(--foreground)"; // series thứ 2 (macro-F1, strict, câu đầu…) — nhạt, khác màu CLIP

export function LabE3Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e3.${key}`, opts ?? {});
  const r = run.result;
  const curve = useMemo(() => e3PrecisionCurve(r), [r]);
  const groups = useMemo(() => e3Groups(r), [r]);
  const captions = useMemo(() => e3Captions(r), [r]);
  const compositional = e3Compositional(r).map((c) => ({
    ...c,
    label: `${c.lang} · ${k(`compositional.models.${c.model}`, { defaultValue: c.model })}`,
  }));
  const unjudged = pick(r, "c_compositional.unjudged_pairs");
  if (!curve.length && !captions.length && !compositional.length) return null;

  return (
    <div className="space-y-8">
      {curve.length > 0 && (
        <Step index={1} base="lab.digest.e3.classes" params={{ queries: v(pick(r, "a_class_queries.known_all.queries")) }}>
          <TileGrid count={4}>
            <StatTile tag="known" title={k("classes.knownAP")} value={v(pick(r, "a_class_queries.known_all.AP"))} />
            <StatTile tag="known" title="P@10" value={v(pick(r, "a_class_queries.known_all.P@10"))} />
            <StatTile tag="known" title="nDCG@10" value={v(pick(r, "a_class_queries.known_all.nDCG@10"))} />
            <StatTile
              tag="strict"
              title={k("classes.strictAP")}
              value={v(pick(r, "a_class_queries.strict_all.AP"))}
              sub={k("classes.strictSub")}
            />
          </TileGrid>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title={k("classes.curve")} caption={k("classes.curveCaption")}>
                <Lines
                  data={curve}
                  height={260}
                  series={[
                    { key: "known", label: "known", color: CLIP },
                    { key: "strict", label: "strict", color: SECOND, dashed: true },
                  ]}
                />
              </ChartCard>
            </div>
            <ChartCard title={k("classes.groups")} caption={k("classes.groupsCaption")}>
              <HBars
                data={groups}
                perRow={44}
                labelWidth={60}
                domain={[0, 1]}
                legend
                series={[
                  { key: "known", label: "known", color: () => CLIP },
                  { key: "strict", label: "strict", color: () => SECOND, opacity: 0.55 },
                ]}
              />
            </ChartCard>
          </div>
        </Step>
      )}

      {captions.length > 0 && (
        <Step index={2} base="lab.digest.e3.captions" params={{ queries: v(pick(r, "b_captions.full.queries")) }}>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <TileGrid count={3} stacked>
              <StatTile
                tag="R@1"
                title={k("captions.r1")}
                value={v(pick(r, "b_captions.full.R@1"))}
                sub={k("captions.ci", { lo: v(pick(r, "b_captions.full.ci95.R@1_lo")), hi: v(pick(r, "b_captions.full.ci95.R@1_hi")) })}
              />
              <StatTile
                tag="MRR"
                title={k("captions.mrr")}
                value={v(pick(r, "b_captions.full.MRR"))}
                sub={k("captions.ci", { lo: v(pick(r, "b_captions.full.ci95.MRR_lo")), hi: v(pick(r, "b_captions.full.ci95.MRR_hi")) })}
              />
              <StatTile
                tag="rank"
                title={k("captions.median")}
                value={v(pick(r, "b_captions.full.median_rank"))}
                sub={k("captions.medianSub", { collection: v(pick(r, "b_captions.full.collection")) })}
              />
            </TileGrid>
            <div className="lg:col-span-2">
              <ChartCard title={k("captions.chart")} caption={k("captions.caption")}>
                <HBars
                  data={captions}
                  perRow={44}
                  labelWidth={60}
                  domain={[0, 1]}
                  legend
                  series={[
                    { key: "full", label: k("captions.full"), color: () => CLIP },
                    { key: "first", label: k("captions.first"), color: () => SECOND, opacity: 0.55 },
                  ]}
                />
              </ChartCard>
            </div>
          </div>
        </Step>
      )}

      {compositional.length > 0 && (
        <Step index={3} base="lab.digest.e3.compositional">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title={k("compositional.chart")} caption={k("compositional.caption")}>
                <HBars
                  data={compositional}
                  perRow={44}
                  labelWidth={150}
                  domain={[0, 1]}
                  series={[
                    { key: "p10", label: "P@10", color: (row) => toneColor(compositionalTone(row)) },
                    { key: "ndcg10", label: "nDCG@10", color: (row) => toneColor(compositionalTone(row)), opacity: 0.35 },
                  ]}
                />
              </ChartCard>
            </div>
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
          </div>
        </Step>
      )}
    </div>
  );
}
