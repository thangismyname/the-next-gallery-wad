import React from "react";
import { useTranslation } from "react-i18next";
import { Download, RotateCcw } from "lucide-react";
import type { ImportFailure, ImportSession } from "@tng/shared";

import { Button } from "@/components/ui/button";
import { StatGrid } from "./StatGrid";

/** Tải danh sách lỗi về máy (CSV: path,reason). */
function downloadCsv(failures: ImportFailure[]) {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["path,reason", ...failures.map((f) => `${quote(f.path)},${f.reason}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "import-failures.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export const ImportReport: React.FC<{
  status: "done" | "cancelled" | "failed";
  session: ImportSession | null;
  failures: ImportFailure[];
  onRetry: () => void;
}> = ({ status, session, failures, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl">{t(`takeout.finished.${status}`)}</h2>
      {session && (
        <StatGrid
          rows={[
            [t("takeout.report.imported"), session.counts.imported],
            [t("takeout.report.duplicates"), session.counts.duplicates],
            [t("takeout.report.skippedExisting"), session.counts.skippedExisting],
            [t("takeout.report.failed"), failures.length],
          ]}
        />
      )}
      {failures.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <ul className="max-h-60 space-y-1 overflow-auto text-xs text-muted-foreground">
            {failures.slice(0, 200).map((f) => (
              <li key={f.path} className="truncate" title={f.path}>
                <span className="text-destructive">{t(`takeout.reasons.${f.reason}`)}</span> · {f.path}
              </li>
            ))}
          </ul>
          {failures.length > 200 && <p className="text-xs text-muted-foreground">{t("takeout.moreFailures", { n: failures.length - 200 })}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw className="size-3.5" />
              {t("takeout.retryFailed", { n: failures.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => downloadCsv(failures)}>
              <Download className="size-3.5" />
              {t("takeout.downloadFailures")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
