// Tóm tắt E2.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRun } from "@tng/shared";
import { useRunCsv } from "../useLab";
import { apHistogram, e2Groups, e2Reliability, pick, templateDeltas, v, worstClasses } from "@tng/shared/lab";
import { View } from "react-native";
import { ChartCard, DeltaBars, HBars, Lines, StatTile, Step, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

export function LabE2Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const CLIP = c.tone("clip");
  const SECOND = c.foreground;
  const BELOW = c.muted;
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
    <View className="gap-8">
      <Step index={1} base="lab.digest.e2.test">
        <TileGrid>
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
          <View className="gap-4">
            <ChartCard title={k("groups.main")} caption={k("groups.mainCaption")}>
              <HBars
                data={groups.main}
                domain={[0, 1]}
                legend
                series={[
                  { key: "mAP", label: "mAP", color: () => CLIP },
                  { key: "macro_f1", label: "macro-F1", color: () => SECOND, opacity: 0.55 },
                ]}
              />
            </ChartCard>
            {tagDeltas.length > 0 && (
              <View>
                <ChartCard title={k("groups.tags")} caption={k("groups.tagsCaption", { all: v(all) })}>
                  <DeltaBars data={tagDeltas} />
                </ChartCard>
              </View>
            )}
          </View>
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
            <View className="gap-4">
              <ChartCard title={k("classes.histogram")} caption={k("classes.histogramCaption")}>
                <HBars
                  data={histogram}
                  series={[{ key: "count", label: k("classes.count"), color: () => CLIP }]}
                />
              </ChartCard>
              <ChartCard title={k("classes.worst")} caption={k("classes.worstCaption")}>
                <HBars
                  data={worst}
                  domain={[0, 1]}
                  series={[{ key: "value", label: "AP", color: () => CLIP }]}
                />
              </ChartCard>
            </View>
          )}
        </Step>
      )}

      {templateRows.length > 0 && (
        <Step index={5} base="lab.digest.e2.templates">
          <ChartCard
            title={k("templates.chart")}
            caption={k("templates.caption", { chosen: String((r as { template?: unknown }).template) })}
          >
            <DeltaBars data={templateRows} />
          </ChartCard>
        </Step>
      )}
    </View>
  );
}
