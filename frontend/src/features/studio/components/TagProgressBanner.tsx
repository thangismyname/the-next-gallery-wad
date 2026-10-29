import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiBackfill } from "@/hooks/useAiBackfill";

/** Còn ảnh chưa phân loại → banner tiến độ + nút phân loại ngay. */
export const TagProgressBanner: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { status, running, error, run, stop } = useAiBackfill("tags", {
    // Mỗi lô xong → lưới danh mục / ảnh của tag cập nhật ngay.
    onBatch: () =>
      void queryClient.invalidateQueries({ queryKey: ["ai", "tags"] }),
  });
  const data = status.data;
  if (!data || (data.pending === 0 && !running)) return null;

  const percent = data.total ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ScanSearch className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t("studio.pendingTitle", { n: data.pending })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.ai.progress", {
                done: data.done,
                total: data.total,
              })}
            </p>
          </div>
        </div>
        {running ? (
          <Button variant="ghost" size="sm" onClick={stop}>
            <Loader2 className="size-4 animate-spin" />
            {t("settings.ai.stop")}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run()}>
            {t("studio.classifyNow")}
          </Button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
