// Tóm tắt yolo_ft.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import type { LabRun } from "@tng/shared";
import { ChartCard } from "@/features/lab/ui/ChartCard";
import { StatTile, TileGrid } from "@/features/lab/ui/StatTile";
import { Step } from "@/features/lab/ui/Step";
import { DeltaBars, HBars } from "@/features/lab/ui/charts";
import { useRunCsv } from "@/features/lab/useLab";
import { apHistogram, pick, signed, v, yoloFtDetDeltas, yoloFtTagBySet } from "@tng/shared/lab";
import { FAIL_COLOR, KIND_COLOR } from "../colors";

export function LabYoloFtSummary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.yolo_ft.${key}`, opts ?? {});
  const r = run.result;
  const perClass = useRunCsv(run, "per_class.csv");
  const tags = useMemo(() => yoloFtTagBySet(r, "macro_f1_at_precision"), [r]);
  const classRows = useMemo(() => perClass.data?.rows ?? [], [perClass.data]);
  const detDeltas = useMemo(
    () => yoloFtDetDeltas(classRows).map((d) => ({ ...d, color: d.delta >= 0 ? KIND_COLOR.yolo : FAIL_COLOR })),
    [classRows],
  );
  const gapHistogram = useMemo(() => apHistogram(classRows.filter((x) => x.set === "gap"), "ft_det_AP"), [classRows]);
  const baseCoco = pick(r, "oi_detection_AP50.base_coco");
  const ftCoco = pick(r, "oi_detection_AP50.ft_coco");
  if (pick(r, "oi_detection_AP50.ft_gap") == null && pick(r, "ultralytics_test.mAP50_95") == null) return null;
  const pseudo = (r as { pseudo?: unknown } | undefined)?.pseudo;

  return (
    <div className="space-y-8">
      <Step index={1} base="lab.digest.yolo_ft.result" params={{ gap: v(pick(r, "gap_classes")), classes: v(pick(r, "classes")) }}>
        <TileGrid count={4}>
          <StatTile
            tag="gap"
            title={k("result.gapAP")}
            value={v(pick(r, "oi_detection_AP50.ft_gap"))}
            sub={k("result.gapAPSub", { n: v(pick(r, "gap_classes")) })}
          />
          <StatTile
            tag="coco"
            title={k("result.coco")}
            value={signed(ftCoco != null && baseCoco != null ? ftCoco - baseCoco : undefined)}
            pass={(pick(r, "paired_ci95.ft_minus_base_coco_mAP_hi") ?? 0) >= 0}
            sub={k("result.cocoSub", {
              base: v(baseCoco),
              ft: v(ftCoco),
              lo: signed(pick(r, "paired_ci95.ft_minus_base_coco_mAP_lo")),
              hi: signed(pick(r, "paired_ci95.ft_minus_base_coco_mAP_hi")),
            })}
          />
          <StatTile
            tag="mAP@50-95"
            title={k("result.ultra")}
            value={v(pick(r, "ultralytics_test.mAP50_95"))}
            sub={k("result.ultraSub", {
              coco: v(pick(r, "ultralytics_test.mAP50_95_coco_classes")),
              gap: v(pick(r, "ultralytics_test.mAP50_95_gap_classes")),
            })}
          />
          <StatTile
            tag="ms/img"
            title={k("result.latency")}
            value={v(pick(r, "latency.ft.ms_per_image"))}
            sub={k("result.latencySub", {
              base: v(pick(r, "latency.base.ms_per_image")),
              mb: v(pick(r, "latency.ft.file_mb")),
              params: v(pick(r, "latency.ft.params_m")),
            })}
          />
        </TileGrid>
      </Step>

      {tags.length > 0 && (
        <Step index={2} base="lab.digest.yolo_ft.tags">
          <ChartCard title={k("tags.chart")} caption={k("tags.caption")}>
            <HBars
              data={tags}
              perRow={44}
              labelWidth={80}
              domain={[0, 1]}
              legend
              series={[
                { key: "base", label: k("tags.base"), color: () => KIND_COLOR.yolo, opacity: 0.4 },
                { key: "ft", label: k("tags.ft"), color: () => KIND_COLOR.yolo },
              ]}
            />
          </ChartCard>
        </Step>
      )}

      {(perClass.isLoading || classRows.length > 0) && (
        <Step index={3} base="lab.digest.yolo_ft.classes">
          {perClass.isLoading ? (
            <Skeleton className="h-72 rounded-xl bg-muted/40" />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <ChartCard title={k("classes.deltas")} caption={k("classes.deltasCaption")}>
                <DeltaBars data={detDeltas} label="Δ AP@0.5" perRow={22} labelWidth={130} />
              </ChartCard>
              <ChartCard title={k("classes.gap")} caption={k("classes.gapCaption")}>
                <HBars
                  data={gapHistogram}
                  perRow={24}
                  labelWidth={70}
                  series={[{ key: "count", label: k("classes.count"), color: () => KIND_COLOR.yolo }]}
                />
              </ChartCard>
            </div>
          )}
        </Step>
      )}

      {pseudo != null && (
        <Step index={4} base="lab.digest.yolo_ft.pseudo" params={{ target: v(pick(r, "pseudo.precision_target")) }}>
          <TileGrid count={4}>
            <StatTile tag="pseudo" title={k("pseudo.boxes")} value={v(pick(r, "pseudo.pseudo_boxes"))} sub={k("pseudo.boxesSub", { human: v(pick(r, "pseudo.human_boxes")) })} />
            <StatTile tag="pseudo" title={k("pseudo.images")} value={v(pick(r, "pseudo.images_with_pseudo"))} />
            <StatTile
              tag="pseudo"
              title={k("pseudo.classes")}
              value={`${v(pick(r, "pseudo.classes_reached"))}/${v(pick(r, "pseudo.coco_classes"))}`}
              sub={k("pseudo.classesSub")}
            />
            <StatTile
              tag="CLIP"
              title={k("pseudo.clip")}
              value={v(pick(r, "pseudo.clip_resolved"))}
              sub={k("pseudo.clipSub", { rejected: v(pick(r, "pseudo.clip_rejected")) })}
            />
          </TileGrid>
        </Step>
      )}
    </div>
  );
}
