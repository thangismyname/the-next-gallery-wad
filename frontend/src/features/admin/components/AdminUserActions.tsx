import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Loader2,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unlock,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminQueryKeys,
  banAdminUser,
  deleteAdminUser,
  revokeAllAdminUserSessions,
  setAdminUserRole,
  unbanAdminUser,
} from "@/services/admin";
import type { AdminUser } from "@/types";

type Dialog = "ban" | "delete" | null;

/**
 * Menu ⋯ của 1 người dùng: đổi vai trò, khoá / mở khoá (kèm lý do), đăng xuất
 * mọi thiết bị, xoá (kèm toàn bộ ảnh). Không cho thao tác lên chính mình.
 */
export function AdminUserActions({
  user,
  isSelf,
  onDeleted,
}: {
  user: AdminUser;
  isSelf: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");

  const action = useMutation({
    mutationFn: async (kind: "role" | "ban" | "unban" | "logout" | "delete") => {
      if (kind === "role")
        await setAdminUserRole(user.id, user.role === "admin" ? "user" : "admin");
      else if (kind === "ban") await banAdminUser(user.id, reason.trim());
      else if (kind === "unban") await unbanAdminUser(user.id);
      else if (kind === "logout") await revokeAllAdminUserSessions(user.id);
      else await deleteAdminUser(user.id);
      return kind;
    },
    onSuccess: async (kind) => {
      setDialog(null);
      setReason("");
      if (kind === "delete") onDeleted?.();
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
    },
  });

  if (isSelf) {
    return (
      <span className="text-xs text-muted-foreground">{t("admin.you")}</span>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("admin.table.actions")}
            onClick={(e) => e.stopPropagation()}
          >
            {action.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => action.mutate("role")}>
            {user.role === "admin" ? (
              <ShieldOff className="size-4" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {user.role === "admin"
              ? t("admin.action.makeUser")
              : t("admin.action.makeAdmin")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => action.mutate("logout")}>
            <LogOut className="size-4" />
            {t("admin.action.revokeSessions")}
          </DropdownMenuItem>
          {user.banned ? (
            <DropdownMenuItem onClick={() => action.mutate("unban")}>
              <Unlock className="size-4" />
              {t("admin.action.unban")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog("ban")}>
              <Ban className="size-4" />
              {t("admin.action.ban")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDialog("delete")}
          >
            <Trash2 className="size-4" />
            {t("admin.action.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && !action.isPending && setDialog(null)}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "ban"
                ? t("admin.action.banTitle")
                : t("admin.action.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "ban"
                ? t("admin.action.banConfirm", { name: user.name || user.email })
                : t("admin.action.deleteConfirm", {
                    name: user.name || user.email,
                    n: user.mediaCount,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialog === "ban" && (
            <div className="space-y-1.5">
              <Label htmlFor="ban-reason">{t("admin.action.banReason")}</Label>
              <Input
                id="ban-reason"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("admin.action.banReasonPlaceholder")}
              />
            </div>
          )}
          {action.isError && (
            <p className="text-sm text-destructive">
              {(action.error as Error).message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={action.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                action.mutate(dialog === "ban" ? "ban" : "delete");
              }}
            >
              {action.isPending && <Loader2 className="size-4 animate-spin" />}
              {dialog === "ban"
                ? t("admin.action.ban")
                : t("admin.action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
