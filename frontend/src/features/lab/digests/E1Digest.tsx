// Tóm tắt E1.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { StepHeader } from "@/features/lab/ui/Step";
import { DeltaBars } from "@/features/lab/ui/charts";
import { ToleranceLegend } from "@/features/lab/ui/legends";
import { e1Checks, e1Datasets, e1DeltaRows, e1PipelineDeltas, e1Recall, e1Tolerance, fmt } from "@tng/shared/lab";
import { KIND_COLOR } from "../colors";

/** e1: 4 phép chấm R@1 vs paper (Δ, dải ±tolerance) · pipeline app làm R@1 đổi bao nhiêu · bảng Recall@K. */
export function LabE1Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e1.${key}`, opts ?? {});
  const tolerance = e1Tolerance(run.config);
  const checks = useMemo(() => e1Checks(run.result, tolerance), [run.result, tolerance]);
  const deltaRows = useMemo(() => e1DeltaRows(run.result, tolerance), [run.result, tolerance]);
  const pipeline = e1PipelineDeltas(run.result).map((d) => ({
    label: `${d.dataset} ${d.dir} · ${k(`pipeline.variants.${d.variant}`)}`,
    delta: d.delta,
    color: KIND_COLOR.clip,
  }));
  const recall = useMemo(
    () => e1Datasets(run.result).flatMap((d) => e1Recall(run.result, d).map((r) => ({ ...r, dataset: d }))),
    [run.result],
  );
  if (!checks.length) return null;
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div className="space-y-8">

      <section className="space-y-3">
        <StepHeader
          index={1}
          title={k("checks.title")}
          question={k("checks.question", { tol: tolerance, passed, total: checks.length })}
        />
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <TileGrid count={checks.length} stacked>
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
          <div className="lg:col-span-2">
            <ChartCard
              title={k("checks.chart")}
              caption={k("checks.caption", { tol: tolerance })}
              legend={<ToleranceLegend tol={tolerance} />}
            >
              <DeltaBars data={deltaRows} label="Δ R@1" tolerance={tolerance} perRow={44} labelWidth={110} />
            </ChartCard>
          </div>
        </div>
      </section>

      {pipeline.length > 0 && (
        <section className="space-y-3">
          <StepHeader index={2} title={k("pipeline.title")} question={k("pipeline.question")} />
          <ChartCard title={k("pipeline.chart")} caption={k("pipeline.caption", { tol: tolerance })}>
            <DeltaBars data={pipeline} label="Δ R@1" tolerance={tolerance} perRow={28} labelWidth={240} />
          </ChartCard>
        </section>
      )}

      <section className="space-y-3">
        <StepHeader index={3} title={k("recall.title")} question={k("recall.question")} />
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {["dataset", "metric", "ours", "paper", "delta"].map((c) => (
                  <th key={c} className={c === "dataset" || c === "metric" ? "px-4 py-2 text-left font-normal" : "px-4 py-2 text-right font-normal"}>
                    {k(`recall.cols.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {recall.map((r) => {
                const delta = r.ours != null && r.paper != null ? r.ours - r.paper : undefined;
                return (
                  <tr key={`${r.dataset}-${r.label}`} className="border-t border-border/40">
                    <td className="px-4 py-1.5">{r.dataset}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">{r.label}</td>
                    <td className="px-4 py-1.5 text-right">{fmt("value", r.ours) || "—"}</td>
                    <td className="px-4 py-1.5 text-right text-muted-foreground">{fmt("value", r.paper) || "—"}</td>
                    <td className="px-4 py-1.5 text-right">{delta == null ? "—" : fmt("delta", delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
