import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdminSystem } from "@/types";
import { AiCoverageBars } from "./AiCoverageBars";

/** ai-service online? + model / provider đang chạy + tiến độ AI toàn hệ thống. */
export function AdminAiStatusCard({ system }: { system?: AdminSystem }) {
  const { t } = useTranslation();
  const ai = system?.aiService;

  const rows = ai?.online
    ? [
        { label: "CLIP", value: ai.clipModel, provider: ai.providers?.clip },
        { label: "YOLO", value: null, provider: ai.providers?.yolo },
        { label: "DINOv3", value: null, provider: ai.providers?.dino },
        { label: "Tagger", value: ai.tagModel, provider: null },
      ]
    : [];

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-mono text-xs font-normal tracking-widest text-muted-foreground uppercase">
          {t("admin.system.title")}
        </CardTitle>
        {ai && (
          <Badge
            variant={ai.online ? "secondary" : "destructive"}
            className="gap-1.5"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                ai.online ? "bg-emerald-500" : "bg-white",
              )}
            />
            {ai.online ? t("admin.system.online") : t("admin.system.offline")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {!system ? (
          <Skeleton className="h-48 rounded-lg bg-muted/40" />
        ) : (
          <>
            {ai?.online ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                {rows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="font-mono tracking-widest text-muted-foreground uppercase">
                      {row.label}
                    </dt>
                    <dd className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate" title={row.value ?? undefined}>
                        {row.value ?? row.provider ?? "—"}
                      </span>
                      {/* Provider "stub" = chưa chạy model thật → cảnh báo */}
                      {row.provider === "stub" && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                          stub
                        </Badge>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("admin.system.offlineHint")}
              </p>
            )}
            <div className="border-t border-border/60 pt-4">
              <p className="mb-3 text-xs text-muted-foreground">
                {t("admin.system.coverage", { n: system.coverage.total })}
              </p>
              <AiCoverageBars coverage={system.coverage} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
