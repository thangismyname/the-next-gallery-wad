import { formatRelative, labQueryKeys, type LabJob, type LabJobStep } from "@tng/shared";
import { isJobActive, stepSummary } from "@tng/shared/lab";
import { router } from "expo-router";
import { Check, CircleDashed, PlayCircle, Square, TerminalSquare, X } from "lucide-react-native";
import { useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { WorkspaceScreen } from "@/components/shared/WorkspaceScreen";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AdminBadge, AdminCard } from "@/features/admin/components/AdminUi";
import { Segmented } from "@/features/profile/components/SettingsGroup";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { cn } from "@/lib/utils";

import { RunBuilder } from "./RunBuilder";
import { RunSuite } from "./RunSuite";
import { useLabJob, useRunnerActions, useRunnerSchema, useRunnerState } from "./useRunner";

const badgeVariant = (state: string) =>
  state === "done" ? "secondary" : state === "failed" || state === "lost" ? "destructive" : "outline";

/** Tab Chạy (`/dev/run`, web `/dev/run` RunnerView): chạy `python -m experiments` qua ai-service lab_runner. */
export function DevRunScreen() {
  const { t, i18n } = useTranslation();
  const { isDeveloper } = useDeveloperMode();
  const runner = useRunnerState();
  const data = runner.data;
  const schema = useRunnerSchema(Boolean(data?.available));
  const [picked, setPicked] = useState<string>();
  const jobId = picked ?? data?.active?.id ?? data?.jobs[0]?.id;
  const job = useLabJob(jobId);
  const { start, cancel } = useRunnerActions();
  const [started, setStarted] = useState(0); // đổi key → builder xoá lựa chọn sau khi chạy
  const [mode, setMode] = useState<"suite" | "single">("suite");
  const startJob = (body: { label?: string; steps: LabJobStep[] }) =>
    start.mutate(body, {
      onSuccess: (created) => {
        setStarted((n) => n + 1);
        setPicked(created.id);
      },
    });

  const blockedReason = !isDeveloper
    ? t("lab.runner.notDeveloper")
    : data?.active
      ? t("lab.runner.busy")
      : data?.external_running
        ? t("lab.runner.externalShort")
        : undefined;

  return (
    <WorkspaceScreen title={t("lab.runner.title")} subtitle={t("lab.runner.desc")} refreshKey={labQueryKeys.runner} keyboard>
      {runner.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : runner.isError || !data?.available ? (
        <View className="items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12">
          <Icon as={PlayCircle} size={28} className="text-muted-foreground" />
          <Text className="text-center text-sm text-muted-foreground">{runner.isError ? t("lab.offline") : data?.reason}</Text>
        </View>
      ) : (
        <>
          {data.external_running ? (
            <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-4">
              <Icon as={TerminalSquare} size={18} className="text-foreground" />
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold">{t("lab.runner.externalTitle")}</Text>
                <Text className="text-xs text-muted-foreground">{t("lab.runner.external")}</Text>
              </View>
            </View>
          ) : null}

          {job.data ? (
            <JobCard
              job={job.data}
              canCancel={isDeveloper}
              cancelling={cancel.isPending}
              error={cancel.error?.message}
              onCancel={() => cancel.mutate(job.data.id)}
            />
          ) : jobId ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : null}

          {schema.data ? (
            <>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "suite", label: t("lab.runner.tabs.suite") },
                  { value: "single", label: t("lab.runner.tabs.single") },
                ]}
              />
              {mode === "suite" ? (
                <RunSuite
                  key={started}
                  schema={schema.data}
                  blockedReason={blockedReason}
                  starting={start.isPending}
                  error={start.error?.message}
                  onStart={startJob}
                />
              ) : (
                <RunBuilder
                  key={started}
                  schema={schema.data}
                  blockedReason={blockedReason}
                  starting={start.isPending}
                  error={start.error?.message}
                  onStart={startJob}
                />
              )}
            </>
          ) : schema.isError ? (
            <Text className="text-sm text-destructive">{schema.error.message}</Text>
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          )}

          {data.jobs.length > 0 ? (
            <AdminCard title={t("lab.runner.history")} flush>
              {data.jobs.map((j, i) => (
                <Pressable
                  key={j.id}
                  onPress={() => setPicked(j.id)}
                  className={cn(
                    "flex-row items-center gap-3 px-4 py-3 active:bg-muted",
                    i > 0 && "border-t border-border",
                    j.id === jobId && "bg-muted/60",
                  )}
                >
                  <View className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-sm">
                      {j.label}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
                      {t("lab.runner.stepCount", { count: j.steps })} · {formatRelative(j.finished ?? j.created, i18n.language)}
                    </Text>
                  </View>
                  <AdminBadge label={t(`lab.runner.state.${j.state}`)} variant={badgeVariant(j.state)} />
                </Pressable>
              ))}
            </AdminCard>
          ) : null}
        </>
      )}
    </WorkspaceScreen>
  );
}

const STEP_ICON: Record<NonNullable<LabJobStep["state"]>, { icon: typeof Check; className: string }> = {
  running: { icon: CircleDashed, className: "text-foreground" },
  done: { icon: Check, className: "text-emerald-600 dark:text-emerald-400" },
  failed: { icon: X, className: "text-destructive" },
  cancelled: { icon: Square, className: "text-muted-foreground" },
};

/** 1 job (web `JobPanel`): từng bước (run id → mở experiment) + đuôi log + Dừng. */
function JobCard({
  job,
  canCancel,
  cancelling,
  error,
  onCancel,
}: {
  job: LabJob;
  canCancel: boolean;
  cancelling: boolean;
  error?: string;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const active = isJobActive(job.state);
  const logRef = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <AdminCard title={job.label} right={<AdminBadge label={t(`lab.runner.state.${job.state}`)} variant={badgeVariant(job.state)} />}>
      <View className="gap-3">
        <Text className="font-mono text-[11px] text-muted-foreground">
          {job.id} · {formatRelative(job.started ?? job.created, i18n.language)}
        </Text>
        <View className="overflow-hidden rounded-xl border border-border">
          {job.steps.map((step, i) => {
            const mark = step.state ? STEP_ICON[step.state] : null;
            return (
              <View key={i} className={cn("flex-row items-start gap-2 px-3 py-2", i > 0 && "border-t border-border")}>
                {step.state === "running" ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Icon as={mark?.icon ?? CircleDashed} size={14} className={mark?.className ?? "text-muted-foreground/60"} />
                )}
                <View className="flex-1 gap-0.5">
                  <Text className="font-mono text-[11px]">{stepSummary(step)}</Text>
                  {step.run_id ? (
                    <Pressable
                      hitSlop={6}
                      onPress={() => router.push({ pathname: "/dev/experiments/[exp]", params: { exp: step.cmd, run: step.run_id } })}
                    >
                      <Text className="font-mono text-[11px] text-muted-foreground underline">{step.run_id}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        <ScrollView
          ref={logRef}
          nestedScrollEnabled
          className="max-h-80 rounded-xl bg-muted/50"
          contentContainerClassName="p-3"
          onContentSizeChange={() => active && logRef.current?.scrollToEnd({ animated: false })}
        >
          <Text selectable className="font-mono text-[10px] leading-4">
            {job.log?.trim() || t("lab.runner.noLog")}
          </Text>
        </ScrollView>
        {active && canCancel ? (
          <Button variant="outline" disabled={cancelling} onPress={onCancel} className="flex-row gap-2">
            <Icon as={Square} size={14} className="text-foreground" />
            <Text>{t("lab.runner.cancel")}</Text>
          </Button>
        ) : null}
        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      </View>
    </AdminCard>
  );
}
