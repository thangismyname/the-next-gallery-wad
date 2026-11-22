import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, ImagePlus, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";
import { useMomentInviteStore } from "@/features/moments/useMomentInviteStore";
import { MomentTemplate, momentInvitationsQueryKey, notificationsQueryKey } from "@tng/shared";
import { notificationText } from "@/features/notifications/notificationText";

interface MomentCollabInvite {
  momentId?: string;
  template?: MomentTemplate;
  slotCount?: number;
  inviterId?: string;
  inviterName?: string;
  inviterAvatar?: string | null;
  expiresIn?: number;
}

/** `notification:new` (backend `notifications.service.js::notify`). */
interface NotificationNew {
  id?: string;
  type?: string;
  actorName?: string | null;
  payload?: Record<string, unknown>;
}

interface Toast {
  key: string;
  invite: MomentCollabInvite;
  /** Thông báo thường (vd bạn đã xoá moment) — chỉ có nút đóng, không có "Điền ảnh". */
  notice?: NotificationNew;
  /** Mốc hết hạn tuyệt đối — toast mới KHÔNG reset timer của toast cũ. */
  expiresAt: number;
}

const TOAST_TTL_MS = 15_000;

/**
 * Toast lời mời moment collab — mount toàn app (MainLayout).
 * Lắng nghe `moment:collab-invite` trên socket dùng chung và hiện thông báo
 * bất kể user đang ở trang nào. Bấm "Điền ảnh" → về /moments và mở sẵn dialog.
 */
export const MomentInviteToast: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signaling = useSignaling();
  const queryClient = useQueryClient();
  const setPendingFillId = useMomentInviteStore((s) => s.setPendingFillId);

  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return signaling.on(SIGNAL.MOMENT_COLLAB_INVITE, (payload) => {
      const invite = payload as MomentCollabInvite;
      if (!invite.momentId) return;
      setToasts((prev) => {
        if (prev.some((t) => t.key === invite.momentId)) return prev;
        return [
          ...prev,
          {
            key: invite.momentId as string,
            invite,
            expiresAt: Date.now() + TOAST_TTL_MS,
          },
        ];
      });
      void queryClient.invalidateQueries({
        queryKey: momentInvitationsQueryKey,
      });
    });
  }, [signaling, queryClient]);

  useEffect(() => {
    return signaling.on(SIGNAL.NOTIFICATION_NEW, (payload) => {
      const notice = payload as NotificationNew;
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      if (!notice.id) return;
      setToasts((prev) => [
        ...prev,
        { key: notice.id as string, invite: {}, notice, expiresAt: Date.now() + TOAST_TTL_MS },
      ]);
    });
  }, [signaling, queryClient]);

  // Dọn theo hạn RIÊNG của từng toast (1 interval chung), không đặt lại timer
  // của toast cũ mỗi khi có toast mới.
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => {
        const next = prev.filter((toast) => toast.expiresAt > now);
        return next.length === prev.length ? prev : next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  const templateLabel = (template?: MomentTemplate): string => {
    if (template === "duo_square") return t("moments.templateDuo");
    if (template === "trio_wide") return t("moments.templateTrio");
    return template ?? "";
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col gap-2 items-end">
      {toasts.map((toast) => {
        const { invite, notice } = toast;
        const dismiss = () => setToasts((prev) => prev.filter((x) => x.key !== toast.key));
        if (notice) {
          return (
            <Alert
              key={toast.key}
              data-slot="notification-toast"
              className="w-[calc(100vw-2rem)] max-w-sm gap-3 border-border/60 p-4 shadow-lg"
            >
              <div className="flex items-start gap-3">
                <BellRing className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <AlertTitle>{t("notifications.title")}</AlertTitle>
                  <AlertDescription className="mt-0.5">
                    {notificationText(
                      { type: notice.type ?? "", payload: notice.payload },
                      notice.actorName || t("notifications.someone"),
                      t,
                    )}
                  </AlertDescription>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label={t("moments.cancel")}>
                  <X className="size-4" />
                </Button>
              </div>
            </Alert>
          );
        }
        const name = invite.inviterName || t("moments.you");
        return (
          <Alert
            key={toast.key}
            data-slot="moment-invite-toast"
            className="w-[calc(100vw-2rem)] max-w-sm gap-3 border-border/60 p-4 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <Avatar size="lg">
                {invite.inviterAvatar ? (
                  <AvatarImage src={invite.inviterAvatar} alt={name} />
                ) : null}
                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <AlertTitle className="flex items-center gap-2">
                  <BellRing className="size-4 shrink-0 text-primary" />
                  {t("moments.inviteToastTitle")}
                </AlertTitle>
                <AlertDescription className="mt-0.5">
                  {t("moments.inviteToastBody", {
                    name,
                    template: templateLabel(invite.template),
                  })}
                </AlertDescription>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  setToasts((prev) =>
                    prev.filter((x) => x.key !== toast.key),
                  )
                }
                aria-label={t("moments.cancel")}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 gap-1"
                onClick={() => {
                  setPendingFillId(toast.key);
                  setToasts((prev) =>
                    prev.filter((x) => x.key !== toast.key),
                  );
                  navigate("/moments");
                }}
              >
                <ImagePlus className="size-3.5" />
                {t("moments.fillSlot")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setToasts((prev) =>
                    prev.filter((x) => x.key !== toast.key),
                  )
                }
              >
                {t("moments.cancel")}
              </Button>
            </div>
          </Alert>
        );
      })}
    </div>
  );
};