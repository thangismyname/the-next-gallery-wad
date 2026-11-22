// Tóm tắt E4.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRun } from "@tng/shared";
import { useRunCsv } from "../useLab";
import { apHistogram, e4Coverage, e4Thresholds, pick, v, worstClasses } from "@tng/shared/lab";
import { View } from "react-native";
import { ChartCard, HBars, StatTile, Step, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

export function LabE4Summary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const YOLO = c.tone("yolo");
  const SECOND = c.foreground;
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.e4.${key}`, opts ?? {});
  const r = run.result;
  const gap = useRunCsv(run, "gap_classes.csv");
  const det = useRunCsv(run, "detection_ap.csv");
  const coverage = e4Coverage(r, gap.data?.rows ?? []).map((c) => ({
    ...c,
    label: k(`coverage.rows.${c.label}`, { defaultValue: c.label }),
  }));
  const testDet = useMemo(() => (det.data?.rows ?? []).filter((x) => x.split === "test"), [det.data]);
  const histogram = useMemo(() => apHistogram(testDet, "AP"), [testDet]);
  const worst = useMemo(() => worstClasses(testDet, "AP"), [testDet]);
  const thresholds = e4Thresholds(r).map((x) => ({ ...x, label: k(`thresholds.rows.${x.label}`, { defaultValue: x.label }) }));
  const covered = pick(r, "covered_classes");
  const gapCount = pick(r, "gap_classes");
  if (pick(r, "test_detection_mAP50") == null) return null;

  return (
    <View className="gap-8">
      <Step index={1} base="lab.digest.e4.coverage">
        <View className="gap-4">
          <TileGrid>
            <StatTile
              tag="mAP@0.5"
              title={k("coverage.det")}
              value={v(pick(r, "test_detection_mAP50"))}
              sub={k("coverage.detSub")}
            />
            <StatTile
              tag="tag"
              title={k("coverage.tag")}
              value={v(thresholds[0]?.mAP)}
              sub={k("coverage.ci", { lo: v(pick(r, "test_tag_ci95.mAP_lo")), hi: v(pick(r, "test_tag_ci95.mAP_hi")) })}
            />
            <StatTile
              tag="gap"
              title={k("coverage.gap")}
              value={v(gapCount)}
              sub={k("coverage.gapSub", { covered: v(covered), total: v(covered != null && gapCount != null ? covered + gapCount : undefined) })}
            />
          </TileGrid>
          <View>
            <ChartCard title={k("coverage.chart")} caption={k("coverage.caption")}>
              {gap.isLoading ? (
                <Skeleton className="h-32 rounded-lg bg-muted/40" />
              ) : (
                <HBars
                  data={coverage}
                  series={[{ key: "count", label: k("coverage.classes"), color: (row) => c.tone(row.tone) }]}
                />
              )}
            </ChartCard>
          </View>
        </View>
      </Step>

      {(det.isLoading || testDet.length > 0) && (
        <Step index={2} base="lab.digest.e4.classes" params={{ count: testDet.length }}>
          {det.isLoading ? (
            <Skeleton className="h-72 rounded-xl bg-muted/40" />
          ) : (
            <View className="gap-4">
              <ChartCard title={k("classes.histogram")} caption={k("classes.histogramCaption")}>
                <HBars
                  data={histogram}
                  series={[{ key: "count", label: k("coverage.classes"), color: () => YOLO }]}
                />
              </ChartCard>
              <ChartCard title={k("classes.worst")} caption={k("classes.worstCaption")}>
                <HBars
                  data={worst}
                  domain={[0, 1]}
                  series={[{ key: "value", label: "AP@0.5", color: () => YOLO }]}
                />
              </ChartCard>
            </View>
          )}
        </Step>
      )}

      {thresholds.length > 0 && (
        <Step index={3} base="lab.digest.e4.thresholds">
          <ChartCard title={k("thresholds.chart")} caption={k("thresholds.caption", { mAP: v(thresholds[0]?.mAP) })}>
            <HBars
              data={thresholds}
              domain={[0, 1]}
              legend
              series={[
                { key: "macro_f1", label: "macro-F1", color: () => YOLO },
                { key: "micro_precision", label: "micro-precision", color: () => SECOND, opacity: 0.55 },
              ]}
            />
          </ChartCard>
        </Step>
      )}
    </View>
  );
}
