// Tóm tắt E5.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { DeltaBars, HBars } from "@/features/lab/ui/charts";
import { KindLegend } from "@/features/lab/ui/legends";
import { useRunCsv } from "@/features/lab/useLab";
import { e5BySet, e5FtDeltas, e5RuleChoice, e5Strategies, pick, signed, v } from "@tng/shared/lab";
import { KIND_COLOR, colorOf } from "../colors";

export function LabE5Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e5.${key}`, opts ?? {});
  const r = run.result;
  const strategiesCsv = useRunCsv(run, "strategies.csv");
  const strategies = useMemo(() => e5Strategies(r), [r]);
  const bySet = useMemo(
    () => e5BySet(strategiesCsv.data?.rows ?? [], ["clip_only", "yolo_only", "per_tag"]),
    [strategiesCsv.data],
  );
  const rules = useMemo(() => e5RuleChoice(r), [r]);
  const rulesFt = useMemo(() => e5RuleChoice(r, "rule_choice_ft"), [r]);
  const ftDeltas = useMemo(() => e5FtDeltas(r).map((d) => ({ ...d, color: colorOf(d.label) })), [r]);
  const ci = (name: string) => ({
    lo: signed(pick(r, `paired_ci95.${name}_lo`)),
    hi: signed(pick(r, `paired_ci95.${name}_hi`)),
  });
  const perTag = pick(r, "test_all_classes.per_tag.macro_f1");
  if (perTag == null) return null;

  const ruleSeries = [
    { key: "clip", label: "clip", color: () => KIND_COLOR.clip },
    { key: "yolo", label: "yolo", color: () => KIND_COLOR.yolo },
    { key: "or", label: "or (max)", color: () => KIND_COLOR.fusion },
    { key: "and", label: "and (min)", color: () => KIND_COLOR.fusion, opacity: 0.45 },
  ];
  const ruleLabel = (rows: typeof rules) =>
    rows.map((x) => ({ ...x, label: k(`rules.rows.${x.label}`, { defaultValue: x.label }) }));

  return (
    <div className="space-y-8">
      <Step index={1} base="lab.digest.e5.strategies" params={{ target: v(pick(r, "precision_target")) }}>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <TileGrid count={3} stacked>
            <StatTile
              tag="per_tag"
              title={k("strategies.perTag")}
              value={v(perTag)}
              sub={k("strategies.vsClip", {
                delta: signed(perTag - (pick(r, "test_all_classes.clip_only.macro_f1") ?? perTag)),
                ...ci("per_tag_minus_clip_macro_f1"),
              })}
            />
            <StatTile
              tag="per_tag vs yolo"
              title={k("strategies.vsYoloTitle")}
              value={`${ci("per_tag_minus_yolo_macro_f1_covered").lo}…${ci("per_tag_minus_yolo_macro_f1_covered").hi}`}
              sub={k("strategies.vsYoloSub")}
            />
            <StatTile
              tag="mAP"
              title={k("strategies.mAP")}
              value={v(pick(r, "test_all_classes.per_tag.mAP"))}
              sub={k("strategies.mAPSub", ci("per_tag_minus_clip_mAP"))}
            />
          </TileGrid>
          <div className="lg:col-span-2">
            <ChartCard
              title={k("strategies.chart")}
              caption={k("strategies.caption")}
              legend={<KindLegend kinds={["clip", "yolo", "fusion"]} />}
            >
              <HBars
                data={strategies}
                perRow={40}
                labelWidth={110}
                domain={[0, 1]}
                series={[
                  { key: "macro_f1", label: "macro-F1", color: (row) => colorOf(row.label) },
                  { key: "mAP", label: "mAP", color: (row) => colorOf(row.label), opacity: 0.35 },
                ]}
              />
            </ChartCard>
          </div>
        </div>
      </Step>

      {(strategiesCsv.isLoading || bySet.length > 0) && (
        <Step index={2} base="lab.digest.e5.sets">
          <ChartCard title={k("sets.chart")} caption={k("sets.caption")}>
            {strategiesCsv.isLoading ? (
              <Skeleton className="h-72 rounded-lg bg-muted/40" />
            ) : (
              <HBars
                data={bySet}
                perRow={52}
                labelWidth={110}
                domain={[0, 1]}
                legend
                series={[
                  { key: "clip_only", label: "clip_only", color: () => KIND_COLOR.clip },
                  { key: "yolo_only", label: "yolo_only", color: () => KIND_COLOR.yolo },
                  { key: "per_tag", label: "per_tag", color: () => KIND_COLOR.fusion },
                ]}
              />
            )}
          </ChartCard>
        </Step>
      )}

      {rules.length > 0 && (
        <Step index={3} base="lab.digest.e5.rules">
          <div className={rulesFt.length ? "grid items-start gap-4 lg:grid-cols-2" : ""}>
            <ChartCard title={k("rules.chart")} caption={k("rules.caption")}>
              <HBars data={ruleLabel(rules)} perRow={40} labelWidth={150} legend stacked series={ruleSeries} />
            </ChartCard>
            {rulesFt.length > 0 && (
              <ChartCard title={k("rules.chartFt")} caption={k("rules.captionFt")}>
                <HBars data={ruleLabel(rulesFt)} perRow={40} labelWidth={150} legend stacked series={ruleSeries} />
              </ChartCard>
            )}
          </div>
        </Step>
      )}

      {ftDeltas.length > 0 && (
        <Step index={4} base="lab.digest.e5.ft">
          <ChartCard
            title={k("ft.chart")}
            caption={k("ft.caption", ci("per_tag_ft_minus_per_tag_macro_f1"))}
            legend={<KindLegend kinds={["yolo", "fusion"]} />}
          >
            <DeltaBars data={ftDeltas} label="Δ macro-F1" perRow={32} labelWidth={120} />
          </ChartCard>
        </Step>
      )}
    </div>
  );
}
