import React from "react";
import { formatEta, formatSpeed } from "@/utils/format";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TransferProgress as TransferProgressData } from "@/types";
import { cn } from "@/lib/utils";

interface TransferProgressProps {
  progress: TransferProgressData;
  onCancel?: () => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  progress,
  onCancel,
}) => {
  const { t } = useTranslation();
  const ratio = progress.totalBytes > 0 ? progress.bytesTransferred / progress.totalBytes : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const done = progress.status === "completed";
  const failed = progress.status === "failed" || progress.status === "cancelled";

  return (
    <Card
      data-slot="share-transfer-progress"
      className="flex items-center gap-4 p-4 border-border/40"
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {done ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : failed ? (
            <XCircle className="size-4 text-red-500" />
          ) : (
            <FileUp className="size-4 text-muted-foreground" />
          )}
          <span className="truncate">
            {done
              ? t("share.transferComplete")
              : failed
                ? progress.currentFile || t("share.cancel")
                : progress.currentFile || t("share.transferProgress")}
          </span>
        </div>

        <Progress
          value={done ? 100 : percent}
          className={cn(
            "h-1.5 rounded-full",
            failed && "bg-red-500/20 [&_[data-slot=progress-indicator]]:bg-red-500",
          )}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("share.filesCount", {
              done: progress.completedFiles,
              total: progress.totalFiles,
            })}
          </span>
          {!done && !failed && progress.speed > 0 && (
            <span className="flex items-center gap-3">
              <span>
                {t("share.speed")}: {formatSpeed(progress.speed)}
              </span>
              <span>
                {t("share.eta")}: {formatEta(progress.eta)}
              </span>
            </span>
          )}
        </div>
      </div>

      {!done && !failed && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("share.cancel")}
        </Button>
      )}
    </Card>
  );
};