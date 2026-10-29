import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Code2, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeveloperModeDialog } from "@/features/developer/DeveloperModeDialog";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useAiBackfill } from "@/hooks/useAiBackfill";
import type { AiPipeline } from "@/services/aiProcessing";
import { AI_BAR, type AiSource } from "@/lib/aiColors";
import { cn } from "@/lib/utils";

// Pipeline → màu nguồn AI (như chip ở landing / Spotlight).
const PIPELINE_SOURCE: Record<AiPipeline, AiSource> = {
  tags: "tag",
  clip: "clip",
  yolo: "yolo",
  dino: "dino",
};

const PIPELINES: AiPipeline[] = ["tags", "clip", "yolo", "dino"];

/**
 * Tiến độ các pipeline AI trên ảnh của user (phân loại tag, CLIP tìm kiếm,
 * YOLO vật thể, DINOv3 ảnh tương tự) + nút xử lý ảnh còn thiếu, và Developer Mode.
 */
export const AiProcessingCard: React.FC = () => {
  const { t } = useTranslation();
  const { status: devStatus, devModeEnabled } = useDeveloperMode();
  const [devOpen, setDevOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          {t("settings.ai.title")}
        </CardTitle>
        <CardDescription>{t("settings.ai.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PIPELINES.map((p) => (
          <PipelineRow key={p} pipeline={p} />
        ))}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Code2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("developer.title")}</p>
              <p className="truncate text-xs text-muted-foreground">
                {devModeEnabled
                  ? t("developer.toggleOn")
                  : t(`developer.status.${devStatus}`)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDevOpen(true)}>
            {t("settings.ai.manage")}
          </Button>
        </div>
      </CardContent>

      <DeveloperModeDialog open={devOpen} onOpenChange={setDevOpen} />
    </Card>
  );
};

/** 1 pipeline: thanh tiến độ đã xử lý / tổng + chạy backfill theo lô. */
function PipelineRow({ pipeline }: { pipeline: AiPipeline }) {
  const { t } = useTranslation();
  const {
    status: { data, isPending },
    running,
    error,
    run,
    stop,
  } = useAiBackfill(pipeline);

  const percent = data?.total ? Math.round((data.done / data.total) * 100) : 0;
  const complete = data ? data.pending === 0 : false;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                AI_BAR[PIPELINE_SOURCE[pipeline]],
              )}
            />
            {t(`settings.ai.${pipeline}.name`)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t(`settings.ai.${pipeline}.desc`)}
          </p>
        </div>
        {isPending ? (
          <Skeleton className="h-7 w-20 bg-muted/40" />
        ) : complete ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="size-3" />
            {t("settings.ai.complete")}
          </Badge>
        ) : running ? (
          <Button variant="ghost" size="sm" onClick={stop}>
            <Loader2 className="size-4 animate-spin" />
            {t("settings.ai.stop")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void run()}>
            {t("settings.ai.process", { n: data?.pending ?? 0 })}
          </Button>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            AI_BAR[PIPELINE_SOURCE[pipeline]],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {data
          ? t("settings.ai.progress", { done: data.done, total: data.total })
          : " "}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
