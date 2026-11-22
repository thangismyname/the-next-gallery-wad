import { useTranslation } from "react-i18next";
import { Check, Clock3, ImagePlus, Pencil, Trash2, Users, X } from "lucide-react";
import { getInitials, resolveMediaUrl, type Moment, type MomentSlot } from "@tng/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  moment: Moment;
  /** Đồng ý = chọn ảnh ghép vào ô của mình. */
  onFill: (moment: Moment) => void;
  /** Người được mời: từ chối lời mời. */
  onDecline: (moment: Moment) => void;
  /** Draft của mình (chưa đủ ảnh): sửa. */
  onEdit: (moment: Moment) => void;
  /** Người tạo hoặc người tham gia: xoá cả moment chung. */
  onDelete: (moment: Moment) => void;
};

const STATUS = {
  filled: { icon: Check, key: "moments.slotFilled", tone: "text-emerald-600 dark:text-emerald-400" },
  waiting: { icon: Clock3, key: "moments.slotWaiting", tone: "text-muted-foreground" },
  declined: { icon: X, key: "moments.slotDeclined", tone: "text-destructive" },
} as const;

const slotStatus = (s: MomentSlot) => (s.filled ? "filled" : s.declined ? "declined" : "waiting");

/**
 * 1 lời mời / 1 moment đang chờ trong popover chuông: ảnh bìa + người tạo + tiến độ từng ô
 * (ai đã ghép · đang chờ · đã từ chối). Người được mời: Ghép ảnh · Từ chối; người tạo: Sửa;
 * cả hai: Xoá moment chung.
 */
export const MomentInvitationItem: React.FC<Props> = ({ moment, onFill, onDecline, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const myPendingCount = moment.myPendingSlots?.length ?? 0;
  const fillable = myPendingCount > 0;
  const slots = [...moment.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const done = slots.filter((s) => s.filled).length;
  const cover = slots.find((s) => s.filled)?.thumbnailUrl;
  const summary = fillable
    ? myPendingCount > 1
      ? t("moments.yourSlotsPending", { n: myPendingCount })
      : t("moments.yourSlotPending")
    : t("moments.waitingForFriends", {
        n: new Set(slots.filter((s) => !s.filled && !s.declined).map((s) => s.userId)).size,
      });

  return (
    <li className="rounded-md p-2 hover:bg-muted/40">
      <div className="flex items-center gap-2.5">
        <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-[9px] text-muted-foreground">
          {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <Users className="size-4" />}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-medium">{moment.userName}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{summary}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t("moments.deleteShared")}
          title={t("moments.deleteShared")}
          onClick={() => onDelete(moment)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Tiến độ: thanh + từng ô (ai, trạng thái). */}
      <div className="mt-2 space-y-1.5 pl-[2.875rem]">
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${(done / Math.max(1, slots.length)) * 100}%` }} />
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {t("moments.progress", { done, total: slots.length })}
          </span>
        </div>
        <ul className="space-y-1">
          {slots.map((slot) => {
            const status = STATUS[slotStatus(slot)];
            return (
              <li key={slot.slotIndex} className="flex items-center gap-1.5 text-[11px]">
                <Avatar size="sm" className="size-4">
                  {slot.userAvatarUrl && <AvatarImage src={resolveMediaUrl(slot.userAvatarUrl)} alt="" />}
                  <AvatarFallback className="text-[7px]">{getInitials(slot.userName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{slot.userName}</span>
                <span className={cn("flex shrink-0 items-center gap-0.5", status.tone)}>
                  <status.icon className="size-3" />
                  {t(status.key)}
                </span>
              </li>
            );
          })}
        </ul>

        {fillable ? (
          <div className="flex gap-1.5 pt-0.5">
            <Button size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onFill(moment)}>
              <ImagePlus className="size-3" />
              {t("moments.accept")}
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onDecline(moment)}>
              {t("moments.decline")}
            </Button>
          </div>
        ) : moment.isOwn ? (
          <div className="flex gap-1.5 pt-0.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onEdit(moment)}>
              <Pencil className="size-3" />
              {t("moments.editDraft")}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
};
