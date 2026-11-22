import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PlayCircle, TerminalSquare } from "lucide-react";
import { formatRelative, type LabJobStep } from "@tng/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { cn } from "@/lib/utils";
import { JobBuilder } from "./components/JobBuilder";
import { SuiteBuilder } from "./components/SuiteBuilder";
import { JobPanel } from "./components/JobPanel";
import { jobBadgeVariant } from "./jobBadge";
import { useLabJob, useRunnerActions, useRunnerSchema, useRunnerState } from "./useRunner";

/** /dev/run — chạy `python -m experiments` từ UI (ai-service lab_runner.py). Job đang xem = ?job=, mặc định job đang chạy / mới nhất. */
export function RunnerView() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { isDeveloper } = useDeveloperMode();
  const runner = useRunnerState();
  const data = runner.data;
  const schema = useRunnerSchema(Boolean(data?.available));
  const jobId = params.get("job") ?? data?.active?.id ?? data?.jobs[0]?.id;
  const job = useLabJob(jobId);
  const { start, cancel } = useRunnerActions();
  const [started, setStarted] = useState(0); // đổi key → JobBuilder xoá hàng đợi sau khi chạy

  const startJob = (body: { label?: string; steps: LabJobStep[] }) =>
    start.mutate(body, {
      onSuccess: (created) => {
        setStarted((n) => n + 1);
        setParams({ job: created.id }, { replace: true });
      },
    });

  const header = <AdminPageHeader title={t("lab.runner.title")} subtitle={t("lab.runner.desc")} />;
  if (runner.isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {header}
        <Skeleton className="h-96 rounded-xl bg-muted/40" />
      </div>
    );
  }
  if (runner.isError || !data?.available) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {header}
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <PlayCircle className="size-8 animate-float" />
            {runner.isError ? t("lab.offline") : data?.reason}
          </CardContent>
        </Card>
      </div>
    );
  }

  const blockedReason = !isDeveloper
    ? t("lab.runner.notDeveloper")
    : data.active
      ? t("lab.runner.busy")
      : data.external_running
        ? t("lab.runner.externalShort")
        : undefined;

  return (
    <div className="space-y-5 p-4 md:p-6">
      {header}
      {data.external_running && (
        <Alert>
          <TerminalSquare />
          <AlertTitle>{t("lab.runner.externalTitle")}</AlertTitle>
          <AlertDescription>{t("lab.runner.external")}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {schema.data ? (
          <Tabs defaultValue="suite" className="min-w-0">
            <TabsList>
              <TabsTrigger value="suite">{t("lab.runner.tabs.suite")}</TabsTrigger>
              <TabsTrigger value="single">{t("lab.runner.tabs.single")}</TabsTrigger>
            </TabsList>
            {(["suite", "single"] as const).map((tab) => {
              const Builder = tab === "suite" ? SuiteBuilder : JobBuilder;
              return (
                <TabsContent key={tab} value={tab} className="mt-3">
                  <Builder
                    key={started}
                    schema={schema.data}
                    blockedReason={blockedReason}
                    starting={start.isPending}
                    error={start.error?.message}
                    onStart={startJob}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        ) : schema.isError ? (
          <p className="text-sm text-destructive">{schema.error.message}</p>
        ) : (
          <Skeleton className="h-96 rounded-xl bg-muted/40" />
        )}

        <div className="space-y-5">
          {job.data ? (
            <JobPanel
              job={job.data}
              canCancel={isDeveloper}
              cancelling={cancel.isPending}
              onCancel={() => cancel.mutate(job.data.id)}
            />
          ) : (
            <Card className="border-border/60">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {jobId ? <Skeleton className="h-40 rounded-lg bg-muted/40" /> : t("lab.runner.noJob")}
              </CardContent>
            </Card>
          )}
          {cancel.error && <p className="text-xs text-destructive">{cancel.error.message}</p>}

          {data.jobs.length > 0 && (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">{t("lab.runner.history")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {data.jobs.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => setParams({ job: j.id }, { replace: true })}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50",
                          j.id === jobId && "bg-muted/60",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{j.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("lab.runner.stepCount", { count: j.steps })} ·{" "}
                          {formatRelative(j.finished ?? j.created, i18n.language)}
                        </span>
                        <Badge variant={jobBadgeVariant(j.state)}>{t(`lab.runner.state.${j.state}`)}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
