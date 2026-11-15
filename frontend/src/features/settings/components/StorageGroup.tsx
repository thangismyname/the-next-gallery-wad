import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { emptyTrash } from "@/services/media";
import { fetchStorageBreakdown } from "@/services/profile";
import { formatBytes, trashQueryKey, profileStatsQueryKey, storageQueryKey } from "@tng/shared";
import { TRASH_PATH } from "@/features/trash/trashPath";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const SEGMENTS = [
  { key: "photos", color: "bg-primary" },
  { key: "videos", color: "bg-sky-500" },
  { key: "trash", color: "bg-destructive/70" },
] as const;

/** Used space (photos · videos · trash bar) + Trash row + empty trash — mobile "Storage" group. */
export const StorageGroup: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const [failed, setFailed] = useState(false);
  const { data } = useQuery({
    queryKey: storageQueryKey,
    queryFn: fetchStorageBreakdown,
    staleTime: 60_000,
  });
  const bytes = {
    photos: data?.photoBytes ?? 0,
    videos: data?.videoBytes ?? 0,
    trash: data?.trashBytes ?? 0,
  };
  const total = bytes.photos + bytes.videos + bytes.trash;

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

  // Dialogs sit outside the group: every child of SettingsGroup is a row (with a divider).
  return (
    <>
    <SettingsGroup title={t("settings.storage.title")} footer={t("settings.storage.desc")}>
      <SettingsRow
        icon={HardDrive}
        title={t("settings.storage.used")}
        value={data ? formatBytes(total) : "…"}
      >
        <div className="space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {total > 0 &&
              SEGMENTS.map((s) => (
                <div
                  key={s.key}
                  className={s.color}
                  style={{ width: `${(bytes[s.key] / total) * 100}%` }}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SEGMENTS.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", s.color)} />
                {t(`settings.storage.${s.key}`)} · {formatBytes(bytes[s.key])}
              </span>
            ))}
          </div>
        </div>
      </SettingsRow>
      <SettingsRow
        icon={Trash2}
        title={t("trash.title")}
        subtitle={data ? t("settings.storage.trashCount", { n: data.trashCount }) : undefined}
        trailing={
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to={TRASH_PATH}>{t("settings.storage.viewTrash")}</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.trashCount || emptying}
              onClick={() => setConfirmOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              {emptying && <Loader2 className="size-4 animate-spin" />}
              {t("settings.storage.emptyTrash")}
            </Button>
          </div>
        }
      />
    </SettingsGroup>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !emptying && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.storage.emptyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.storage.emptyDesc", {
                n: data?.trashCount ?? 0,
                size: formatBytes(data?.trashBytes ?? 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failed && <p className="text-sm text-destructive">{t("settings.storage.emptyFailed")}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptying}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleEmpty();
              }}
              disabled={emptying}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {emptying ? <Loader2 className="size-4 animate-spin" /> : t("settings.storage.emptyConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
