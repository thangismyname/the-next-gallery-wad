import { type AiPipeline } from "@tng/shared";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, Loader2, ScanSearch, Search, Tags, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAiBackfill } from "@/hooks/useAiBackfill";
import { AI_BAR, type AiSource } from "@/lib/aiColors";
import { cn } from "@/lib/utils";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const PIPELINES: { id: AiPipeline; source: AiSource; icon: LucideIcon }[] = [
  { id: "tags", source: "tag", icon: Tags },
  { id: "clip", source: "clip", icon: Search },
  { id: "yolo", source: "yolo", icon: ScanSearch },
  { id: "dino", source: "dino", icon: Eye },
];

/**
 * Progress of each AI pipeline over the user's photos + batched backfill (bar in
 * the AI source color, "Process N" / Stop / done) — same rows as the mobile
 * account sheet (Developer Mode = its own group).
 */
export const AiProcessingGroup: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SettingsGroup title={t("settings.ai.title")} footer={t("settings.ai.desc")}>
      {PIPELINES.map((p) => (
        <PipelineRow key={p.id} {...p} />
      ))}
    </SettingsGroup>
  );
};

function PipelineRow({ id, source, icon }: { id: AiPipeline; source: AiSource; icon: LucideIcon }) {
  const { t } = useTranslation();
  const { status, running, error, run, stop } = useAiBackfill(id);
  const data = status.data;
  const percent = data?.total ? Math.round((data.done / data.total) * 100) : 0;
  const complete = data ? data.pending === 0 : false;

  return (
    <SettingsRow
      icon={icon}
      title={t(`settings.ai.${id}.name`)}
      subtitle={t(`settings.ai.${id}.desc`)}
      trailing={
        !data ? null : complete && !running ? (
          <Badge variant="secondary" className="shrink-0 gap-1">
            <CheckCircle2 className="size-3" />
            {t("settings.ai.complete")}
          </Badge>
        ) : running ? (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={stop}>
            <Loader2 className="size-4 animate-spin" />
            {t("settings.ai.stop")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void run()}>
            {t("settings.ai.process", { n: data.pending })}
          </Button>
        )
      }
    >
      <div className="space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", AI_BAR[source])}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {data ? t("settings.ai.progress", { done: data.done, total: data.total }) : "…"}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </SettingsRow>
  );
}
