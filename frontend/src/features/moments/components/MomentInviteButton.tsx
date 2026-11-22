import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Loader2, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { declineMoment, deleteMoment } from "@/services/moments";
import type { Moment } from "@tng/shared";
import { cn } from "@/lib/utils";
import { useMomentInviteStore } from "../useMomentInviteStore";
import { useMomentEditStore } from "../useMomentEditStore";
import { useMomentInvitations } from "../useMomentInvitations";
import { MomentInvitationItem } from "./MomentInvitationItem";
import { MomentFillDialog } from "./MomentFillDialog";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { useNotifications } from "@/features/notifications/useNotifications";

type Props = {
  onFeedChanged: () => void;
  /** Hiện dạng nút tròn nổi (FAB) đặt trên feed Moments thay vì nút vuông góc header. */
  floating?: boolean;
};

/**
 * Chuông lời mời moment collab (draft chưa đủ ảnh, hiệu lực 24h).
 * - Realtime qua WS (useMomentInvitations): lời mời mới / moment đủ slot → refresh.
 * - Bấm lời mời có slot của mình → MomentFillDialog chọn 1+ ảnh.
 *
 * Popover (không phải DropdownMenu) vì trong danh sách có nút phụ (Sửa / Huỷ
 * draft) — menu item lồng button là HTML không hợp lệ.
 */
export const MomentInviteButton: React.FC<Props> = ({ onFeedChanged, floating = false }) => {
  const { t } = useTranslation();
  const invitations = useMomentInvitations(onFeedChanged);
  const { items, total: inviteTotal, isPending, isFetching, refetch } = invitations;
  // Thông báo đã lưu (vd bạn đã xoá moment mình cùng đăng) — chung chuông với lời mời.
  const notifications = useNotifications();
  const total = inviteTotal + notifications.items.length;

  const [open, setOpen] = useState(false);
  const [fillTarget, setFillTarget] = useState<Moment | null>(null);
  // Xác nhận xoá moment chung (người tạo / người tham gia) hoặc từ chối lời mời.
  const [confirm, setConfirm] = useState<{ kind: "delete" | "decline"; moment: Moment } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const setEditDraft = useMomentEditStore((s) => s.setEditDraft);

  // Thông báo lỗi tự tắt — không chặn UI như window.alert.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const openFill = useCallback((moment: Moment) => setFillTarget(moment), []);

  // Mở sẵn dialog điền ảnh khi user đến từ toast lời mời app-wide.
  const pendingFillId = useMomentInviteStore((s) => s.pendingFillId);
  const setPendingFillId = useMomentInviteStore((s) => s.setPendingFillId);
  useEffect(() => {
    if (!pendingFillId) return;
    const target = items.find((m) => m.id === pendingFillId);
    if (target && (target.myPendingSlots?.length ?? 0) > 0) {
      openFill(target);
      setPendingFillId(null);
    } else if (!isPending && !isFetching) {
      // Chỉ bỏ khi danh sách đã tải xong mà vẫn không có (lời mời hết hạn / đã điền). Trước đây
      // bỏ ngay lần đầu — lúc danh sách còn là bản cũ chưa có lời mời mới → bấm toast không mở gì.
      setPendingFillId(null);
    }
  }, [pendingFillId, items, isPending, isFetching, openFill, setPendingFillId]);

  // Xoá moment chung (người tạo hoặc người tham gia) / từ chối lời mời.
  const handleConfirm = async () => {
    if (!confirm || cancelling) return;
    setCancelling(true);
    try {
      if (confirm.kind === "delete") await deleteMoment(confirm.moment.id);
      else await declineMoment(confirm.moment.id);
      onFeedChanged();
      void refetch();
    } catch {
      setNotice(t(confirm.kind === "delete" ? "moments.deleteFailed" : "moments.declineFailed"));
    } finally {
      setCancelling(false);
      setConfirm(null);
    }
  };

  // FAB: ẩn khi không còn việc gì để làm — nhưng KHÔNG unmount dialog điền ảnh
  // (dialog nằm ngoài popover nên vẫn sống).
  const showBell = !floating || isPending || total > 0 || Boolean(fillTarget);
  const closeThen = (fn: (m: Moment) => void) => (m: Moment) => {
    setOpen(false);
    fn(m);
  };

  return (
    <>
      {showBell && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) invitations.invalidate();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant={floating ? "secondary" : "outline"}
              size="icon"
              className={cn("relative shrink-0", floating && "glass pointer-events-auto size-12 rounded-full hover:bg-background")}
              aria-label={t("moments.invitations")}
              title={t("moments.invitations")}
            >
              <BellRing className={cn(floating ? "size-5" : "size-4")} />
              {total > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px]">{total}</Badge>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={8}
            className="max-h-[min(70svh,32rem)] w-[min(20rem,calc(100vw-2rem))] gap-2 overflow-y-auto p-2"
          >
            <NotificationList items={notifications.items} onDelete={notifications.remove} onClear={notifications.clear} />

            <div className="flex items-center gap-2 px-1 py-0.5 text-xs font-semibold uppercase">
              <Users className="size-3.5 text-primary" />
              {t("moments.invitations")}
            </div>

            {isPending ? (
              <div className="space-y-2 p-1">
                <Skeleton className="h-10 w-full rounded-md bg-muted/40" />
                <Skeleton className="h-10 w-full rounded-md bg-muted/40" />
              </div>
            ) : items.length === 0 ? (
              notifications.items.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t("moments.noInvitations")}</p>
              )
            ) : (
              <ul className="flex flex-col gap-0.5">
                {items.map((moment) => (
                  <MomentInvitationItem
                    key={moment.id}
                    moment={moment}
                    onFill={closeThen(openFill)}
                    onEdit={closeThen(setEditDraft)}
                    onDecline={closeThen((m) => setConfirm({ kind: "decline", moment: m }))}
                    onDelete={closeThen((m) => setConfirm({ kind: "delete", moment: m }))}
                  />
                ))}
              </ul>
            )}

            {invitations.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void invitations.fetchNextPage()}
                disabled={invitations.isFetchingNextPage}
              >
                {invitations.isFetchingNextPage ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  t("moments.loadMore")
                )}
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}

      {notice && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive shadow-lg"
        >
          {notice}
        </div>
      )}

      <MomentFillDialog
        target={fillTarget}
        onClose={() => setFillTarget(null)}
        onFilled={(complete) => {
          if (complete) onFeedChanged();
          setFillTarget(null);
          void refetch();
        }}
      />

      {/* Xác nhận huỷ draft — thay cho window.confirm */}
      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(confirm?.kind === "decline" ? "moments.declineConfirm" : "moments.deleteShared")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(confirm?.kind === "decline" ? "moments.declineConfirmDesc" : "moments.deleteSharedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{t("moments.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {cancelling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t(confirm?.kind === "decline" ? "moments.decline" : "moments.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
