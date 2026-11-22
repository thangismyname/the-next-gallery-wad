import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, FileArchive, Loader2 } from "lucide-react";
import { itemsForMode, type EditedMode } from "@tng/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImportHistory } from "./components/ImportHistory";
import { ImportReport } from "./components/ImportReport";
import { SourcePicker } from "./components/SourcePicker";
import { StatGrid } from "./components/StatGrid";
import { useImport } from "./useImport";

/**
 * Nhập từ Google Takeout (`/import`, menu "Tải lên ▾"): chọn nguồn (zip / thư mục / kéo thả) →
 * xem trước → nhập (engine chung, chạy tiếp khi chuyển trang) → báo cáo (`/api/imports`) + lịch sử.
 */
export const ImportView: React.FC = () => {
  const { t } = useTranslation();
  const { phase, progress, failures, session, scan, start, retryFailed, cancel, reset } = useImport();
  const running = phase.kind === "running" || phase.kind === "scanning" || phase.kind === "checking";
  const [edited, setEdited] = useState<EditedMode>("both");
  const toUpload =
    phase.kind === "ready" ? itemsForMode(phase.plan.items, edited).filter((it) => !phase.existing.has(it.path)).length : 0;

  // Đóng tab giữa chừng = dừng nhập → hỏi lại.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/gallery">
          <ArrowLeft className="size-4" />
          {t("nav.gallery")}
        </Link>
      </Button>

      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <FileArchive className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("takeout.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("takeout.intro")}</p>
        </div>
      </header>

      {(phase.kind === "idle" || phase.kind === "error") && (
        <>
          <ol className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            {(["step1", "webStep2"] as const).map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="w-4 font-semibold">{i + 1}.</span>
                <span>{t(`takeout.${step}`)}</span>
              </li>
            ))}
          </ol>
          {phase.kind === "error" && <p className="text-sm text-destructive">{t(`takeout.errors.${phase.error}`)}</p>}
          <SourcePicker onSource={(source) => void scan(source)} />
          <ImportHistory />
        </>
      )}

      {(phase.kind === "scanning" || phase.kind === "checking") && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          {phase.kind === "scanning" ? t("takeout.scanning", { n: phase.files }) : t("takeout.checking")}
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="space-y-4">
          <StatGrid
            rows={[
              [t("takeout.stats.photos"), phase.plan.stats.media - phase.plan.stats.videos],
              [t("takeout.stats.videos"), phase.plan.stats.videos],
              [t("takeout.stats.albums"), phase.plan.albums.length],
              [t("takeout.stats.duplicates"), phase.plan.stats.duplicates],
              [t("takeout.stats.existing"), phase.existing.size],
              [t("takeout.stats.missingJson"), phase.plan.stats.missingJson],
              [t("takeout.stats.livePhotos"), phase.plan.stats.livePhotos],
              [t("takeout.stats.edited"), phase.plan.stats.edited],
            ]}
          />
          {phase.plan.stats.edited > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("takeout.editedMode.label")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["both", "original", "edited"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={edited === mode}
                    onClick={() => setEdited(mode)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      edited === mode ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                    )}
                  >
                    {t(`takeout.editedMode.${mode}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">{t("takeout.readyHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={toUpload === 0} onClick={() => void start({ edited })}>
              {t("takeout.import", { n: toUpload })}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t("takeout.pickAnother")}
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "running" && (
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t(`takeout.steps.${phase.step}`, { done: phase.done, total: phase.total })}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.round((phase.done / Math.max(1, phase.total)) * 100)}%` }}
            />
          </div>
          {phase.step === "upload" && progress && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("takeout.historyLine", { imported: progress.done - progress.duplicates, duplicates: progress.duplicates, failed: progress.failed })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("takeout.runningHint")}</p>
          <Button variant="outline" size="sm" onClick={cancel}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      {phase.kind === "finished" && (
        <div className="space-y-4">
          <ImportReport status={phase.status} session={session} failures={failures} onRetry={() => void retryFailed()} />
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/gallery">{t("takeout.openGallery")}</Link>
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t("takeout.done")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
