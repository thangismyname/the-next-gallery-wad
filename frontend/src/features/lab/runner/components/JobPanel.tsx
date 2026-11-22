import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, CircleDashed, Loader2, Square, X } from "lucide-react";
import { formatRelative, type LabJob, type LabJobStep } from "@tng/shared";
import { isJobActive, stepSummary } from "@tng/shared/lab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { jobBadgeVariant } from "../jobBadge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEP_ICON: Record<NonNullable<LabJobStep["state"]>, React.ReactNode> = {
  running: <Loader2 className="size-3.5 animate-spin text-foreground" />,
  done: <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
  failed: <X className="size-3.5 text-destructive" />,
  cancelled: <Square className="size-3 text-muted-foreground" />,
};

/** 1 job: trạng thái từng bước (run id → mở trong Lab) + đuôi log (tự cuộn xuống khi đang chạy) + Dừng. */
export function JobPanel({
  job,
  canCancel,
  cancelling,
  onCancel,
}: {
  job: LabJob;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const active = isJobActive(job.state);
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el && active) el.scrollTop = el.scrollHeight;
  }, [job.log, active]);

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="min-w-0 break-words">{job.label}</span>
          <Badge variant={jobBadgeVariant(job.state)}>{t(`lab.runner.state.${job.state}`)}</Badge>
        </CardTitle>
        <CardDescription className="font-mono text-xs">
          {job.id} · {formatRelative(job.started ?? job.created, i18n.language)}
        </CardDescription>
        {active && canCancel && (
          <CardAction>
            <Button variant="outline" size="sm" disabled={cancelling} onClick={onCancel}>
              <Square className="size-3.5" />
              {t("lab.runner.cancel")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="divide-y divide-border/60 rounded-lg border border-border/60">
          {job.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center pt-0.5">
                {step.state ? STEP_ICON[step.state] : <CircleDashed className="size-3.5 text-muted-foreground/60" />}
              </span>
              <code className="min-w-0 flex-1 text-xs break-all">{stepSummary(step)}</code>
              {step.run_id && (
                <Link
                  to={`/dev/lab?exp=${encodeURIComponent(step.cmd)}&run=${encodeURIComponent(step.run_id)}`}
                  className="shrink-0 font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {step.run_id}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <pre
          ref={logRef}
          className="max-h-[28rem] min-h-40 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
        >
          {job.log?.trim() || t("lab.runner.noLog")}
        </pre>
      </CardContent>
    </Card>
  );
}
