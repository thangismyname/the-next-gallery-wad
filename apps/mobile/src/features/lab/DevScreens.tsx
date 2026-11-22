import { formatDuration, formatRelative, type LabExperiment, type LabRun } from "@tng/shared";
import { buildKpis, fmt, OVERVIEW_GROUPS, PIPELINE, pipelineOrder } from "@tng/shared/lab";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, FlaskConical, ShieldCheck } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { WorkspaceScreen, WorkspaceSwitchButton } from "@/components/shared/WorkspaceScreen";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AdminBadge } from "@/features/admin/components/AdminUi";
import { Segmented } from "@/features/profile/components/SettingsGroup";
import { useSession } from "@/features/auth/session";
import { fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { LabBuildSummary } from "./digests/BuildDigest";
import { LabE1Summary } from "./digests/E1Digest";
import { LabE2Summary } from "./digests/E2Digest";
import { LabE3Summary } from "./digests/E3Digest";
import { LabE4Summary } from "./digests/E4Digest";
import { LabE5Summary } from "./digests/E5Digest";
import { LabE6Summary } from "./digests/E6Digest";
import { LabProbeSummary } from "./digests/ProbeDigest";
import { LabSelectSummary } from "./digests/SelectDigest";
import { LabYoloFtSummary } from "./digests/YoloFtDigest";
import { LabOverview } from "./LabOverview";
import { DeleteRunButton } from "./runner/DeleteRunButton";
import { StepHeader } from "./ui";
import { officialRun, useLabExperiments, useLabLatestResults, useLabRun } from "./useLab";
import { useExperimentsView, type ExperimentsView } from "./useExperimentsView";

const LAB_KEY = ["lab"];

// Cùng danh sách với web `LabView` DIGESTS.
const DIGESTS: Record<string, (exp: LabExperiment, run: LabRun) => ReactNode> = {
  select: (exp) => <LabSelectSummary experiment={exp} />,
  build: (exp) => <LabBuildSummary experiment={exp} />,
  e1: (_, run) => <LabE1Summary run={run} />,
  e2: (_, run) => <LabE2Summary run={run} />,
  e3: (_, run) => <LabE3Summary run={run} />,
  e4: (_, run) => <LabE4Summary run={run} />,
  yolo_ft: (_, run) => <LabYoloFtSummary run={run} />,
  e5: (_, run) => <LabE5Summary run={run} />,
  probe: (_, run) => <LabProbeSummary run={run} />,
  e6: (_, run) => <LabE6Summary run={run} />,
};

/** Experiments theo bước luận văn: "Chuẩn bị dữ liệu" (select, build + experiment chưa xếp bước) rồi 4 nhóm
 *  `OVERVIEW_GROUPS` (cùng thứ tự tab Tổng quan). Chỉ experiment có trên đĩa. */
function groupExperiments(experiments: LabExperiment[]) {
  const byId = new Map(experiments.map((e) => [e.exp, e]));
  const stepped = new Set<string>(OVERVIEW_GROUPS.flatMap((g) => g.kpis));
  const groups = [
    { id: "prep", index: undefined as number | undefined, base: "dev.prep", items: experiments.filter((e) => !stepped.has(e.exp)) },
    ...OVERVIEW_GROUPS.map((g, i) => ({
      id: g.id,
      index: i + 1, // = số bước ở tab Tổng quan
      base: `lab.overview.groups.${g.id}`,
      items: g.kpis.map((id) => byId.get(id)).filter((e): e is LabExperiment => Boolean(e)),
    })),
  ];
  return groups.filter((g) => g.items.length > 0);
}

const openExperiment = (exp: string) => router.push({ pathname: "/dev/experiments/[exp]", params: { exp } });

function stateVariant(state?: string) {
  return state === "done" ? "secondary" : state === "error" ? "destructive" : "outline";
}

/** Chưa có dữ liệu (prod / ai-service tắt / chưa chạy experiment nào) → null nếu đã sẵn sàng. */
function useLabList() {
  const { t } = useTranslation();
  const list = useLabExperiments();
  const experiments = list.data?.experiments ?? [];
  const blocker = list.isLoading ? (
    <Skeleton className="h-96 rounded-2xl" />
  ) : list.isError || !list.data?.available || experiments.length === 0 ? (
    <View className="items-center gap-2 rounded-2xl border border-border bg-card px-6 py-12">
      <Icon as={FlaskConical} size={28} className="text-muted-foreground" />
      <Text className="text-center text-sm text-muted-foreground">{t(list.isError ? "lab.offline" : "lab.unavailable")}</Text>
    </View>
  ) : null;
  return { experiments, blocker };
}

/** Tab Tổng quan (`/dev`): 8 KPI theo 4 bước + biểu đồ; chạm thẻ / "Mở" → chi tiết experiment. */
export function DevOverviewScreen() {
  const { t } = useTranslation();
  const { experiments, blocker } = useLabList();
  const isAdmin = (useSession().data?.user as { role?: string | null } | undefined)?.role === "admin";
  return (
    <WorkspaceScreen title={t("dev.workspace")} subtitle={t("lab.desc")} refreshKey={LAB_KEY}>
      {isAdmin ? <WorkspaceSwitchButton to="/admin" icon={ShieldCheck} label={t("admin.switch")} /> : null}
      {blocker ?? <LabOverview experiments={experiments} onOpen={openExperiment} />}
    </WorkspaceScreen>
  );
}

/** Thứ tự experiment của chế độ đang chọn — cùng thứ tự cho danh sách và ‹ › ở chi tiết. */
function orderExperiments(experiments: LabExperiment[], view: ExperimentsView) {
  if (view === "steps") return groupExperiments(experiments).flatMap((g) => g.items);
  const byId = new Map(experiments.map((e) => [e.exp, e]));
  return pipelineOrder(experiments.map((e) => e.exp)).map((id) => byId.get(id)!);
}

/** Tab Thí nghiệm (`/dev/experiments`): "Theo bước" (danh sách theo bước luận văn) | "Theo thứ tự chạy" (trục). */
export function DevExperimentsScreen() {
  const { t } = useTranslation();
  const { experiments, blocker } = useLabList();
  const { view, setView } = useExperimentsView();
  return (
    <WorkspaceScreen title={t("dev.nav.experiments")} subtitle={t("lab.desc")} refreshKey={LAB_KEY}>
      <View className="rounded-full bg-muted">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "steps", label: t("dev.view.steps") },
            { value: "pipeline", label: t("dev.view.pipeline") },
          ]}
        />
      </View>
      {blocker ?? (view === "steps" ? <StepList experiments={experiments} /> : <PipelineTimeline experiments={experiments} />)}
    </WorkspaceScreen>
  );
}

function StepList({ experiments }: { experiments: LabExperiment[] }) {
  const { t, i18n } = useTranslation();
  return groupExperiments(experiments).map((group) => (
    <View key={group.id} className="gap-3">
      <StepHeader index={group.index} title={t(`${group.base}.title`)} question={t(`${group.base}.question`)} />
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {group.items.map((e, j) => {
          const run = e.runs.find((r) => r.run_id === officialRun(e));
          return (
            <Pressable
              key={e.exp}
              accessibilityRole="link"
              onPress={() => openExperiment(e.exp)}
              className={cn("flex-row items-center gap-3 px-4 py-3 active:bg-muted", j > 0 && "border-t border-border")}
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold">{e.exp.toUpperCase()}</Text>
                  {run?.state ? <AdminBadge label={run.state} variant={stateVariant(run.state)} /> : null}
                </View>
                {i18n.exists(`lab.exp.${e.exp}.short`) ? (
                  <Text numberOfLines={2} className="text-xs text-muted-foreground">
                    {t(`lab.exp.${e.exp}.short`)}
                  </Text>
                ) : null}
                {run?.updated ? <Text className="text-[11px] text-muted-foreground">{formatRelative(run.updated, i18n.language)}</Text> : null}
              </View>
              <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
            </Pressable>
          );
        })}
      </View>
    </View>
  ));
}

/**
 * Trục "Theo thứ tự chạy": mọi bước của PIPELINE (bước chưa có kết quả vẫn hiện, mờ — thấy cả chuỗi) + experiment
 * lạ ở cuối. Mỗi nút: chấm trạng thái (đặc = xong · đỏ = lỗi · viền = đang chạy / chưa chạy) · Part · tên · mô tả
 * ngắn · chỉ số chính (KPI tab Tổng quan) · "Cần: …" (phụ thuộc). Chỉ bước có run mới mở được chi tiết.
 */
function PipelineTimeline({ experiments }: { experiments: LabExperiment[] }) {
  const { t, i18n } = useTranslation();
  const { results } = useLabLatestResults(experiments);
  const kpis = new Map(buildKpis(results).map((k) => [k.id, k]));
  const byId = new Map(experiments.map((e) => [e.exp, e]));
  const steps = [
    ...PIPELINE,
    ...experiments.filter((e) => !PIPELINE.some((p) => p.id === e.exp)).map((e) => ({ id: e.exp, part: "", needs: [] as string[] })),
  ];
  return (
    <View className="rounded-2xl border border-border bg-card px-4 pt-4">
      {steps.map((step, i) => {
        const exp = byId.get(step.id);
        const run = exp?.runs.find((r) => r.run_id === officialRun(exp));
        const state = run?.state;
        const kpi = kpis.get(step.id);
        const last = i === steps.length - 1;
        const body = (
          <View className={cn("min-w-0 flex-1 gap-0.5", last ? "pb-4" : "pb-5", !exp && "opacity-50")}>
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {step.part ? <Text className="text-[11px] tabular-nums text-muted-foreground">{t("dev.part", { part: step.part })}</Text> : null}
              <Text className="text-sm font-semibold">{step.id.toUpperCase()}</Text>
              {state ? (
                <AdminBadge label={state} variant={stateVariant(state)} />
              ) : (
                <Text className="text-[11px] text-muted-foreground">{t("dev.notRun")}</Text>
              )}
            </View>
            {i18n.exists(`lab.exp.${step.id}.short`) ? (
              <Text numberOfLines={2} className="text-xs text-muted-foreground">
                {t(`lab.exp.${step.id}.short`)}
              </Text>
            ) : null}
            {kpi?.value != null ? (
              <Text className="text-xs">
                {t(`lab.overview.kpi.${kpi.id}.title`)} · <Text className="text-xs font-semibold tabular-nums">{fmt("value", kpi.value)}</Text>
              </Text>
            ) : null}
            {step.needs.length ? (
              <Text className="text-[11px] text-muted-foreground">
                {t("dev.needs", { list: step.needs.map((n) => n.toUpperCase()).join(", ") })}
              </Text>
            ) : null}
          </View>
        );
        return (
          <View key={step.id} className="flex-row gap-3">
            {/* Trục: chấm + đường nối xuống bước sau */}
            <View className="w-3 items-center pt-1">
              <View
                className={cn(
                  "size-3 rounded-full",
                  state === "done" ? "bg-foreground" : state === "error" ? "bg-destructive" : "border-2 border-muted-foreground bg-card",
                )}
              />
              {last ? null : <View className="mt-1 w-px flex-1 bg-border" />}
            </View>
            {exp ? (
              <Pressable accessibilityRole="link" onPress={() => openExperiment(step.id)} className="min-w-0 flex-1 flex-row active:opacity-60">
                {body}
                <Icon as={ChevronRight} size={16} className="mt-0.5 text-muted-foreground" />
              </Pressable>
            ) : (
              body
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Chi tiết 1 experiment (`/dev/experiments/[exp]`, đẩy trong tab Thí nghiệm): tiêu đề "E3 ▾" mở danh sách
 * nhảy nhanh · mô tả · run picker · trạng thái · tóm tắt · ‹ trước / sau › theo chế độ đang chọn ở tab Thí nghiệm.
 * Không vuốt ngang để đổi experiment — trùng cử chỉ vuốt-để-quay-lại của iOS.
 */
export function DevExperimentScreen() {
  const { t } = useTranslation();
  const { exp, run: runFromUrl } = useLocalSearchParams<{ exp: string; run?: string }>();
  const { experiments, blocker } = useLabList();
  const [jump, setJump] = useState(false);
  const view = useExperimentsView((st) => st.view);
  const order = orderExperiments(experiments, view);
  const index = order.findIndex((e) => e.exp === exp);
  const current = order[index];
  const go = (target?: LabExperiment) => {
    setJump(false);
    if (target) router.setParams({ exp: target.exp });
  };

  const title = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("dev.jump")}
      onPress={() => setJump((v) => !v)}
      className="flex-row items-center gap-2 self-start active:opacity-60"
    >
      <Text className="font-heading text-3xl font-semibold">{(exp ?? "").toUpperCase()}</Text>
      <Text className="text-lg text-muted-foreground">{jump ? "▴" : "▾"}</Text>
    </Pressable>
  );

  return (
    <WorkspaceScreen title={title} refreshKey={LAB_KEY} onBack={() => (router.canGoBack() ? router.back() : router.replace("/dev/experiments"))}>
      {jump ? (
        // Nhảy nhanh: mọi experiment, xuống dòng (không cuộn ngang)
        <View className="flex-row flex-wrap gap-2">
          {order.map((e) => (
            <Pressable
              key={e.exp}
              onPress={() => go(e)}
              className={cn("rounded-full border px-3 py-1.5", e.exp === exp ? "border-primary bg-primary/10" : "border-border active:bg-muted")}
            >
              <Text className={cn("text-xs font-semibold", e.exp !== exp && "text-muted-foreground")}>{e.exp.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {blocker ??
        (current ? (
          <Animated.View key={current.exp} entering={fadeIn} className="gap-5">
            <ExperimentBody experiment={current} initialRun={runFromUrl} />
            <View className="flex-row gap-3">
              <PagerButton dir="prev" target={order[index - 1]} onPress={go} />
              <PagerButton dir="next" target={order[index + 1]} onPress={go} />
            </View>
          </Animated.View>
        ) : (
          <Text className="text-sm text-muted-foreground">{t("lab.noResult")}</Text>
        ))}
    </WorkspaceScreen>
  );
}

function PagerButton({ dir, target, onPress }: { dir: "prev" | "next"; target?: LabExperiment; onPress: (e?: LabExperiment) => void }) {
  const { t } = useTranslation();
  if (!target) return <View className="flex-1" />;
  const next = dir === "next";
  return (
    <Pressable
      onPress={() => onPress(target)}
      className={cn("flex-1 gap-0.5 rounded-2xl border border-border bg-card px-4 py-3 active:bg-muted", next && "items-end")}
    >
      <Text className="text-[11px] text-muted-foreground">{t(`dev.${dir}`)}</Text>
      <View className="flex-row items-center gap-1">
        {next ? null : <Icon as={ChevronLeft} size={14} className="text-muted-foreground" />}
        <Text className="text-sm font-semibold">{target.exp.toUpperCase()}</Text>
        {next ? <Icon as={ChevronRight} size={14} className="text-muted-foreground" /> : null}
      </View>
    </Pressable>
  );
}

/** Nội dung 1 experiment (state riêng: run đang chọn, mở mô tả dài) — `key` theo experiment để reset khi đổi. */
function ExperimentBody({ experiment, initialRun }: { experiment: LabExperiment; initialRun?: string }) {
  const { t, i18n } = useTranslation();
  const [runParam, setRunParam] = useState<string | undefined>(initialRun);
  const [details, setDetails] = useState(false);
  const runId = experiment.runs.find((r) => r.run_id === runParam)?.run_id ?? officialRun(experiment);
  const run = useLabRun(experiment.exp, runId);
  const status = run.data?.status;

  return (
    <>
      {/* Mô tả trước run (như web): bản ngắn luôn hiện, "Chi tiết" mở bản dài. Experiment mới chưa có i18n → ẩn. */}
      {i18n.exists(`lab.exp.${experiment.exp}.short`) ? (
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-sm">{t(`lab.exp.${experiment.exp}.short`)}</Text>
          <Pressable onPress={() => setDetails((v) => !v)} hitSlop={8}>
            <Text className="text-xs text-muted-foreground">
              {t("lab.details")} {details ? "▴" : "▾"}
            </Text>
          </Pressable>
          {details ? <Text className="text-sm leading-relaxed text-muted-foreground">{t(`lab.exp.${experiment.exp}.long`)}</Text> : null}
        </View>
      ) : null}

      {/* Run: chính thức (latest) mặc định; smoke / biến thể chọn được — xuống dòng, không cuộn ngang */}
      <View className="flex-row flex-wrap gap-2">
        {experiment.runs.map((r) => {
          const active = r.run_id === runId;
          return (
            <Pressable
              key={r.run_id}
              onPress={() => setRunParam(r.run_id)}
              className={cn("rounded-full border px-3 py-1.5", active ? "border-primary bg-primary/10" : "border-border")}
            >
              <Text className={cn("text-xs tabular-nums", !active && "text-muted-foreground")}>
                {r.run_id}
                {r.run_id === experiment.latest ? ` · ${t("lab.latest")}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {status ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <AdminBadge label={status.state ?? "?"} variant={stateVariant(status.state)} />
          {status.stage ? <Text className="text-xs text-muted-foreground">{status.stage}</Text> : null}
          {status.elapsed_s != null ? <Text className="text-xs text-muted-foreground">· {formatDuration(status.elapsed_s)}</Text> : null}
          {status.updated ? <Text className="text-xs text-muted-foreground">· {formatRelative(status.updated, i18n.language)}</Text> : null}
          {runId ? (
            <DeleteRunButton
              exp={experiment.exp}
              runId={runId}
              isLatest={runId === experiment.latest}
              onDeleted={() => setRunParam(undefined)}
            />
          ) : null}
        </View>
      ) : null}

      {run.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : run.isError || !run.data ? (
        <Text className="text-sm text-destructive">{t("admin.error.loadFailed")}</Text>
      ) : DIGESTS[experiment.exp] ? (
        DIGESTS[experiment.exp](experiment, run.data)
      ) : (
        <Text className="text-sm text-muted-foreground">{t("lab.noResult")}</Text>
      )}
    </>
  );
}
