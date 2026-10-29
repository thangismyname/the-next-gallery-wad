import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Loader2, Trash2 } from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { emptyTrash, trashQueryKey } from "@/services/media";
import {
  fetchStorageBreakdown,
  profileStatsQueryKey,
  storageQueryKey,
} from "@/services/profile";
import { formatBytes } from "@/utils/format";

/** Dung lượng đang dùng (ảnh / video / thùng rác) + dọn thùng rác. */
export const StorageCard: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const [failed, setFailed] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: storageQueryKey,
    queryFn: fetchStorageBreakdown,
    staleTime: 60_000,
  });

  const segments = data
    ? [
        {
          key: "photos",
          bytes: data.photoBytes,
          color: "bg-primary",
        },
        {
          key: "videos",
          bytes: data.videoBytes,
          color: "bg-sky-500",
        },
        {
          key: "trash",
          bytes: data.trashBytes,
          color: "bg-destructive/70",
        },
      ]
    : [];
  const total = segments.reduce((sum, s) => sum + s.bytes, 0);

  const handleEmpty = async () => {
    setEmptying(true);
    setFailed(false);
    try {
      await emptyTrash();
      setConfirmOpen(false);
      await Promise.all(
        [storageQueryKey, profileStatsQueryKey, trashQueryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch {
      setFailed(true);
    } finally {
      setEmptying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4" />
          {t("settings.storage.title")}
        </CardTitle>
        <CardDescription>{t("settings.storage.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending || !data ? (
          <Skeleton className="h-24 rounded-lg bg-muted/40" />
        ) : (
          <>
            <div>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {formatBytes(total)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.storage.used")}
              </p>
            </div>

            {/* Thanh dung lượng chia theo loại */}
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {total > 0 &&
                segments.map((s) => (
                  <div
                    key={s.key}
                    className={s.color}
                    style={{ width: `${(s.bytes / total) * 100}%` }}
                  />
                ))}
            </div>

            {/* Ô số liệu kẻ mảnh — như landing */}
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 min-[400px]:grid-cols-3">
              {segments.map((s) => (
                <div key={s.key} className="min-w-0 bg-card p-3">
                  <dt className="flex items-center gap-1.5 truncate font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    <span className={cn("size-2 shrink-0 rounded-full", s.color)} />
                    {t(`settings.storage.${s.key}`)}
                  </dt>
                  <dd className="mt-1 font-heading text-lg tabular-nums">
                    {formatBytes(s.bytes)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <p className="text-sm text-muted-foreground">
                {t("settings.storage.trashCount", { n: data.trashCount })}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/trash">{t("settings.storage.viewTrash")}</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.trashCount === 0}
                  onClick={() => setConfirmOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {t("settings.storage.emptyTrash")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => !emptying && setConfirmOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.storage.emptyTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.storage.emptyDesc", {
                n: data?.trashCount ?? 0,
                size: formatBytes(data?.trashBytes ?? 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failed && (
            <p className="text-sm text-destructive">
              {t("settings.storage.emptyFailed")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptying}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleEmpty();
              }}
              disabled={emptying}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {emptying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("settings.storage.emptyConfirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
