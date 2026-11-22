import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { labQueryKeys } from "@tng/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { deleteLabRun } from "@/services/lab";

/** Xoá 1 run khỏi Results/ (History/ giữ nguyên) — chỉ Developer đã duyệt; run latest / đang chạy thì server từ chối. */
export function DeleteRunButton({
  exp,
  runId,
  isLatest,
  onDeleted,
}: {
  exp: string;
  runId: string;
  isLatest: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { isDeveloper } = useDeveloperMode();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteLabRun(exp, runId),
    onSuccess: () => {
      setOpen(false);
      onDeleted();
      void qc.invalidateQueries({ queryKey: labQueryKeys.experiments });
    },
  });
  if (!isDeveloper) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("lab.runner.deleteRun")}
        title={isLatest ? t("lab.runner.deleteLatest") : t("lab.runner.deleteRun")}
        disabled={isLatest}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !del.isPending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lab.runner.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("lab.runner.deleteDesc", { run: `${exp}/${runId}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {del.error && <p className="text-sm text-destructive">{del.error.message}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                del.mutate();
              }}
            >
              {t("lab.runner.deleteRun")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
