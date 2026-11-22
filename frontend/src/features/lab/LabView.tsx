import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, formatRelative, type LabExperiment, type LabRun } from "@tng/shared";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import {
  LabCsvPanel,
  LabHistoryPanel,
  LabLogPanel,
  LabResultPanel,
} from "@/features/lab/explorer/LabPanels";

// Experiment có tóm tắt chọn tay ở tab Kết quả; còn lại = số liệu tự dò.
const DIGESTS: Record<string, (exp: LabExperiment, run: LabRun) => React.ReactNode> = {
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
import { officialRun, useLabExperiments, useLabRun } from "./useLab";
import { LabOverview } from "./LabOverview";
import { DeleteRunButton } from "./runner/components/DeleteRunButton";
import { LabBuildSummary } from "@/features/lab/digests/BuildDigest";
import { LabE1Summary } from "@/features/lab/digests/E1Digest";
import { LabE2Summary } from "@/features/lab/digests/E2Digest";
import { LabE3Summary } from "@/features/lab/digests/E3Digest";
import { LabE4Summary } from "@/features/lab/digests/E4Digest";
import { LabE5Summary } from "@/features/lab/digests/E5Digest";
import { LabE6Summary } from "@/features/lab/digests/E6Digest";
import { LabProbeSummary } from "@/features/lab/digests/ProbeDigest";
import { LabSelectSummary } from "@/features/lab/digests/SelectDigest";
import { LabYoloFtSummary } from "@/features/lab/digests/YoloFtDigest";

/** /dev/lab (khu Developer; admin xem được) — kết quả experiments (E1–E6, probe, yolo_ft…) trên đĩa ai-service, chỉ đọc.
 *  Không có ?exp= → tab Tổng quan; ?exp= &run= &tab= = xem từng experiment. */
export function LabView() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const list = useLabExperiments();
  const experiments = list.data?.experiments ?? [];
  const expParam = params.get("exp");
  const current = expParam
    ? (experiments.find((e) => e.exp === expParam) ?? experiments[0])
    : undefined;
  const runId =
    current?.runs.find((r) => r.run_id === params.get("run"))?.run_id ??
    (current && officialRun(current));
  const run = useLabRun(current?.exp, runId);
  const status = run.data?.status;
  const tab = params.get("tab") ?? "result";

  const update = (values: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(values)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const header = (
    <AdminPageHeader
      title={t("dev.nav.lab")}
      subtitle={t("lab.desc")}
    />
  );

  if (list.isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {header}
        <Skeleton className="h-96 rounded-xl bg-muted/40" />
      </div>
    );
  }
  if (list.isError || !list.data?.available || experiments.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {header}
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <FlaskConical className="size-8 animate-float" />
            {list.isError ? t("lab.offline") : t("lab.unavailable")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {header}

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={current ? "outline" : "default"}
          onClick={() => update({ exp: null, run: null, tab: null })}
        >
          {t("lab.overview.tab")}
        </Button>
        {experiments.map((e) => (
          <Button
            key={e.exp}
            size="sm"
            variant={e.exp === current?.exp ? "default" : "outline"}
            onClick={() => update({ exp: e.exp, run: null })}
            className="font-mono"
            title={t(`lab.exp.${e.exp}.short`, { defaultValue: "" })}
          >
            {e.exp}
          </Button>
        ))}
      </div>

      {!current ? (
        <LabOverview
          experiments={experiments}
          onOpen={(exp) => update({ exp, run: null, tab: null })}
        />
      ) : (
        <>
          {/* Mô tả experiment: bản ngắn luôn hiện, bản dài mở bằng "Chi tiết". Experiment mới chưa có i18n → ẩn. */}
          {i18n.exists(`lab.exp.${current.exp}.short`) && (
            <Card className="border-border/60">
              <CardContent className="space-y-2 py-4 text-sm">
                <p>
                  <span className="mr-2 font-mono text-xs text-muted-foreground uppercase">
                    {current.exp}
                  </span>
                  {t(`lab.exp.${current.exp}.short`)}
                </p>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
                    {t("lab.details")}
                  </summary>
                  <p className="mt-2 leading-relaxed whitespace-pre-line text-muted-foreground">
                    {t(`lab.exp.${current.exp}.long`)}
                  </p>
                </details>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Select value={runId} onValueChange={(v) => update({ run: v })}>
              <SelectTrigger className="w-full font-mono sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {current.runs.map((r) => (
                  <SelectItem
                    key={r.run_id}
                    value={r.run_id}
                    className="font-mono"
                  >
                    {r.run_id}
                    {r.run_id === current.latest &&
                      ` · ${t("lab.latest")}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {runId && (
              <DeleteRunButton
                exp={current.exp}
                runId={runId}
                isLatest={runId === current.latest}
                onDeleted={() => update({ run: null })}
              />
            )}
            {status && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge
                  variant={
                    status.state === "done"
                      ? "secondary"
                      : status.state === "error"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {status.state ?? "?"}
                </Badge>
                {status.stage && <span>{status.stage}</span>}
                {status.elapsed_s != null && (
                  <span>· {formatDuration(status.elapsed_s)}</span>
                )}
                {status.updated && (
                  <span>· {formatRelative(status.updated, i18n.language)}</span>
                )}
              </div>
            )}
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => update({ tab: v === "result" ? null : v })}
          >
            <TabsList>
              <TabsTrigger value="result">
                {t("lab.tabs.result")}
              </TabsTrigger>
              <TabsTrigger value="files">
                {t("lab.tabs.files")}
              </TabsTrigger>
              {current.has_history && (
                <TabsTrigger value="history">
                  {t("lab.tabs.history")}
                </TabsTrigger>
              )}
              <TabsTrigger value="log">{t("lab.tabs.log")}</TabsTrigger>
            </TabsList>

            {run.isLoading ? (
              <Skeleton className="mt-4 h-96 rounded-xl bg-muted/40" />
            ) : run.isError || !run.data ? (
              <p className="mt-4 text-sm text-destructive">
                {t("admin.error.loadFailed")}
              </p>
            ) : (
              <>
                <TabsContent value="result" className="mt-4">
                  {/* DIGESTS: tóm tắt chọn tay (cùng kiểu Tổng quan); số gốc ở tab File CSV / Log. Chưa có tóm tắt → bảng tự dò. */}
                  {DIGESTS[current.exp] ? (
                    DIGESTS[current.exp](current, run.data)
                  ) : (
                    <LabResultPanel key={run.data.run_id} run={run.data} />
                  )}
                </TabsContent>
                <TabsContent value="files" className="mt-4">
                  <LabCsvPanel
                    key={`${run.data.exp}/${run.data.run_id}`}
                    run={run.data}
                  />
                </TabsContent>
                <TabsContent value="log" className="mt-4">
                  <LabLogPanel run={run.data} />
                </TabsContent>
              </>
            )}
            {current.has_history && (
              <TabsContent value="history" className="mt-4">
                <LabHistoryPanel exp={current.exp} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
