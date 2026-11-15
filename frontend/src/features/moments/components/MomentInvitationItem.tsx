import { useTranslation } from "react-i18next";
import { ImagePlus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Moment } from "@tng/shared";

type Props = {
  moment: Moment;
  /** Bấm lời mời có slot của mình → điền ảnh. */
  onFill: (moment: Moment) => void;
  /** Draft của mình (chưa đủ ảnh): sửa / huỷ. */
  onEdit: (moment: Moment) => void;
  onCancel: (moment: Moment) => void;
};

/** 1 dòng trong popover lời mời: ảnh bìa + người tạo + tiến độ (+ nút sửa / huỷ draft của mình). */
export const MomentInvitationItem: React.FC<Props> = ({ moment, onFill, onEdit, onCancel }) => {
  const { t } = useTranslation();
  const myPendingCount = moment.myPendingSlots?.length ?? 0;
  const fillable = myPendingCount > 0;
  const filled = moment.slots.filter((s) => s.filled);
  const cover = filled[0]?.thumbnailUrl;
  const ownDraft = moment.isOwn && !fillable;
  const summary = fillable
    ? myPendingCount > 1
      ? t("moments.yourSlotsPending", { n: myPendingCount })
      : t("moments.yourSlotPending")
    : t("moments.waitingForFriends", {
        n: new Set(moment.slots.filter((s) => !s.filled).map((s) => s.userId)).size,
      });

  const body = (
    <>
      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-[9px] text-muted-foreground">
        {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <Users className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium">{moment.userName}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {summary} · {filled.length}/{moment.slots.length}
        </span>
      </span>
      {fillable && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]">
          <ImagePlus className="size-3.5" />
          {t("moments.fillSlot")}
        </span>
      )}
    </>
  );

  return (
    <li>
      {fillable ? (
        <button
          type="button"
          onClick={() => onFill(moment)}
          className="flex w-full items-center gap-2.5 rounded-md p-2 transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 p-2">{body}</div>
      )}

      {ownDraft && (
        <div className="flex gap-1.5 px-2 pb-2 pl-[3.25rem]">
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={() => onEdit(moment)}>
            <Pencil className="size-3" />
            {t("moments.editDraft")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px] text-destructive"
            onClick={() => onCancel(moment)}
          >
            <Trash2 className="size-3" />
            {t("moments.cancelDraft")}
          </Button>
        </div>
      )}
    </li>
  );
};
