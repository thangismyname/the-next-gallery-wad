// Tóm tắt E2.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { DeltaBars, HBars, Lines } from "@/features/lab/ui/charts";
import { useRunCsv } from "@/features/lab/useLab";
import { apHistogram, e2Groups, e2Reliability, pick, templateDeltas, v, worstClasses } from "@tng/shared/lab";
import { KIND_COLOR } from "../colors";

const CLIP = KIND_COLOR.clip;

const SECOND = "var(--foreground)"; // series thứ 2 (macro-F1, strict, câu đầu…) — nhạt, khác màu CLIP

const BELOW = "var(--muted-foreground)";

export function LabE2Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e2.${key}`, opts ?? {});
  const r = run.result;
  const groups = useMemo(() => e2Groups(r), [r]);
  const reliability = useMemo(() => e2Reliability(r), [r]);
  const perClass = useRunCsv(run, "per_class.csv");
  const templates = useRunCsv(run, "templates.csv");
  const classRows = useMemo(() => perClass.data?.rows ?? [], [perClass.data]);
  const histogram = useMemo(() => apHistogram(classRows), [classRows]);
  const worst = useMemo(() => worstClasses(classRows), [classRows]);
  const templateRows = useMemo(
    () => templateDeltas(templates.data?.rows ?? [], (r as { template?: unknown } | undefined)?.template),
    [templates.data, r],
  );
  const all = groups.main.find((g) => g.label === "all")?.mAP;
  const tagDeltas = groups.tags.map((g) => {
    const delta = g.mAP != null && all != null ? g.mAP - all : undefined;
    return { label: g.label, delta, color: (delta ?? 0) >= 0 ? CLIP : BELOW };
  });
  if (pick(r, "test.mAP") == null) return null;

  return (
    <div className="space-y-8">
      <Step index={1} base="lab.digest.e2.test">
        <TileGrid count={4}>
          <StatTile
            tag="mAP"
            title={k("test.mAP")}
            value={v(pick(r, "test.mAP"))}
            sub={k("test.ci", {
              lo: v(pick(r, "test_ci95.mAP_lo")),
              hi: v(pick(r, "test_ci95.mAP_hi")),
              classes: v(pick(r, "test.classes")),
            })}
          />
          <StatTile
            tag="macro-F1"
            title={k("test.f1")}
            value={v(pick(r, "test.macro_f1"))}
            sub={k("test.ciShort", { lo: v(pick(r, "test_ci95.macro_f1_lo")), hi: v(pick(r, "test_ci95.macro_f1_hi")) })}
          />
          <StatTile
            tag="precision"
            title={k("test.precision")}
            value={v(pick(r, "test.micro_precision"))}
            sub={k("test.microF1", { f1: v(pick(r, "test.micro_f1")) })}
          />
          <StatTile
            tag="ECE"
            title={k("test.ece")}
            value={v(pick(r, "test.ece_calibrated"))}
            sub={k("test.eceRaw", { raw: v(pick(r, "test.ece_raw")) })}
          />
        </TileGrid>
      </Step>

      {groups.main.length > 0 && (
        <Step index={2} base="lab.digest.e2.groups">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <ChartCard title={k("groups.main")} caption={k("groups.mainCaption")}>
              <HBars
                data={groups.main}
                perRow={44}
                labelWidth={60}
                domain={[0, 1]}
                legend
                series={[
                  { key: "mAP", label: "mAP", color: () => CLIP },
                  { key: "macro_f1", label: "macro-F1", color: () => SECOND, opacity: 0.55 },
                ]}
              />
            </ChartCard>
            {tagDeltas.length > 0 && (
              <div className="lg:col-span-2">
                <ChartCard title={k("groups.tags")} caption={k("groups.tagsCaption", { all: v(all) })}>
                  <DeltaBars data={tagDeltas} label="Δ mAP" perRow={22} labelWidth={100} />
                </ChartCard>
              </div>
            )}
          </div>
        </Step>
      )}

      {reliability.length > 0 && (
        <Step index={3} base="lab.digest.e2.calibration">
          <ChartCard
            title={k("calibration.chart")}
            caption={k("calibration.caption", { raw: v(pick(r, "test.ece_raw")), cal: v(pick(r, "test.ece_calibrated")) })}
          >
            <Lines
              data={reliability}
              xKey="x"
              xType="number"
              xDomain={[0, 1]}
              diagonal
              height={300}
              series={[
                { key: "raw", label: k("calibration.raw"), color: BELOW, dashed: true },
                { key: "calibrated", label: k("calibration.calibrated"), color: CLIP },
              ]}
            />
          </ChartCard>
        </Step>
      )}

      {(perClass.isLoading || classRows.length > 0) && (
        <Step index={4} base="lab.digest.e2.classes" params={{ count: classRows.length }}>
          {perClass.isLoading ? (
            <Skeleton className="h-72 rounded-xl bg-muted/40" />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <ChartCard title={k("classes.histogram")} caption={k("classes.histogramCaption")}>
                <HBars
                  data={histogram}
                  perRow={24}
                  labelWidth={70}
                  series={[{ key: "count", label: k("classes.count"), color: () => CLIP }]}
                />
              </ChartCard>
              <ChartCard title={k("classes.worst")} caption={k("classes.worstCaption")}>
                <HBars
                  data={worst}
                  perRow={24}
                  labelWidth={130}
                  domain={[0, 1]}
                  series={[{ key: "value", label: "AP", color: () => CLIP }]}
                />
              </ChartCard>
            </div>
          )}
        </Step>
      )}

      {templateRows.length > 0 && (
        <Step index={5} base="lab.digest.e2.templates">
          <ChartCard
            title={k("templates.chart")}
            caption={k("templates.caption", { chosen: String((r as { template?: unknown }).template) })}
          >
            <DeltaBars data={templateRows} label="Δ val mAP" perRow={26} labelWidth={210} />
          </ChartCard>
        </Step>
      )}
    </div>
  );
}
