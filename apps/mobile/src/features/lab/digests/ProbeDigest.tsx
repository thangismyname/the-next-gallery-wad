// Tóm tắt probe.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LabRun } from "@tng/shared";
import { ciTone, pick, probeBySet, probeSelected, probeSteps, signed, tagLadder, v } from "@tng/shared/lab";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { AdminBadge } from "@/features/admin/components/AdminUi";
import { ChartCard, CiLegend, CiTable, DeltaBars, HBars, KindLegend, StatTile, Step, TileGrid } from "../ui";
import { useLabColors } from "../labColors";

const PROBE_SET_CONFIGS = (c: ReturnType<typeof useLabColors>) => [
  { key: "zs_clip", color: c.tone("clip"), opacity: 0.4 },
  { key: "lp_clip", color: c.tone("clip") },
  { key: "e5_per_tag", color: c.tone("fusion"), opacity: 0.4 },
  { key: "fused_learned", color: c.tone("fusion") },
];

export function LabProbeSummary({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string, opts?: Record<string, unknown>) => t(`lab.digest.probe.${key}`, opts ?? {});
  const s = (key: string) => t(`lab.overview.series.${key}`);
  const r = run.result;
  const ladder = useMemo(() => tagLadder(r), [r]);
  const steps = useMemo(() => probeSteps(r, "macro_f1_at_precision"), [r]);
  const bySet = useMemo(() => probeBySet(r, PROBE_SET_CONFIGS(c).map((c) => c.key), "macro_f1_at_precision"), [r, c]);
  const selected = useMemo(() => probeSelected(r), [r]);
  if (!ladder.length) return null;
  const best = [...ladder].filter((x) => x.label !== "zs_clip" && x.label !== "e5_per_tag").sort((a, b) => (b.mAP ?? 0) - (a.mAP ?? 0))[0];
  const zs = ladder.find((x) => x.label === "zs_clip");

  return (
    <View className="gap-8">
      <Step index={1} base="lab.digest.probe.ladder" params={{ images: v(pick(r, "train_images")), target: v(pick(r, "precision_target")) }}>
        <View className="gap-4">
          <TileGrid>
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
          <View>
            <ChartCard
              title={t("lab.overview.charts.ladder.title")}
              caption={t("lab.overview.charts.ladder.caption")}
              legend={<KindLegend kinds={["clip", "dino", "fusion"]} />}
            >
              <HBars
                data={ladder}
                domain={[0, 1]}
                series={[
                  { key: "f1p", label: s("f1p"), color: (row) => c.of(row.label) },
                  { key: "mAP", label: s("mAP"), color: (row) => c.of(row.label), opacity: 0.35 },
                ]}
              />
            </ChartCard>
          </View>
        </View>
      </Step>

      {steps.length > 0 && (
        <Step index={2} base="lab.digest.probe.steps">
          <ChartCard title={k("steps.chart")} caption={k("steps.caption")} legend={<CiLegend kinds={["clip", "dino", "fusion"]} />}>
            <View className="gap-4">
              <DeltaBars
                data={steps.map((p) => ({ label: p.label, delta: p.delta, tone: ciTone(p) }))}
               
              />
              <CiTable rows={steps} />
            </View>
          </ChartCard>
        </Step>
      )}

      {bySet.length > 0 && (
        <Step index={3} base="lab.digest.probe.sets">
          <ChartCard title={k("sets.chart")} caption={k("sets.caption")}>
            <HBars
              data={bySet}
              domain={[0, 1]}
              legend
              series={PROBE_SET_CONFIGS(c).map((c) => ({ key: c.key, label: c.key, color: () => c.color, opacity: c.opacity }))}
            />
          </ChartCard>
        </Step>
      )}

      {selected.length > 0 && (
        <Step index={4} base="lab.digest.probe.selected">
          {/* Bảng web → mỗi config 1 hàng: tên · L2 · unknown_weight · val mAP · cảnh báo biên lưới */}
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            {selected.map((x, i) => (
              <View key={x.config} className={i > 0 ? "gap-1 border-t border-border px-4 py-2.5" : "gap-1 px-4 py-2.5"}>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-semibold">{x.config}</Text>
                  {x.gridEdge.length > 0 ? (
                    <AdminBadge variant="outline" label={k("selected.edge", { params: x.gridEdge.join(", ") })} />
                  ) : null}
                </View>
                <Text className="text-xs tabular-nums text-muted-foreground">
                  L2 {v(x.l2)} · unknown_weight {v(x.unknownWeight)} · val mAP {v(x.valMAP)}
                </Text>
              </View>
            ))}
          </View>
        </Step>
      )}
    </View>
  );
}
