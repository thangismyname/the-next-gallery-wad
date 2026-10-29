import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock3, Play, Sticker, Trash2, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Moment } from "@/types";
import { cn } from "@/lib/utils";
import { MomentReactions } from "./MomentReactions";
import { TemplateMedia } from "./TemplateMedia";
import { MomentMemePanel } from "./MomentMemePanel";
import { getInitials } from "@/utils/string";
import { getMomentParticipants, timeAgo } from "../participants";

type Props = {
  moment: Moment;
  onDelete?: () => void;
  /** Người được mời rời moment collab (gỡ ảnh của mình). */
  onLeave?: () => void;
  onToggleReaction: (emoji: string) => void;
};

// Double-tap window (ms) — nếu 2 lần click ≤ ngưỡng này → heart reaction.
const DOUBLE_TAP_MS = 300;

/**
 * 1 CARD moment (bo cong 2xl, ảnh tràn viền) chứa đầy đủ overlay:
 * avatar + tên trái-trên, delete phải-trên, nút react + bubbles trái-dưới,
 * xóa/rời phải-dưới, caption phía dưới. Được lồng trong feed vuốt:
 * mobile 1 card / màn hình, desktop 2 card nằm NGANG cạnh nhau.
 *
 * Media nhánh theo template (TemplateMedia): single = 1 ảnh full-bleed,
 * duo_square = 2 ảnh chồng DỌC (mỗi ô ½ chiều cao), trio_wide = 3 ảnh
 * chồng DỌC (mỗi ô ⅓ chiều cao) — mỗi slot 1 ảnh của
 * từng người, được connect trong cùng 1 card/slide.
 */
export const MomentSlide: React.FC<Props> = ({
  moment,
  onDelete,
  onLeave,
  onToggleReaction,
}) => {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const isVideo =
    moment.mediaType === "video" ||
    moment.slots.some((s) => s.mediaType === "video");
  const participants = getMomentParticipants(moment);

  // Double-tap → ❤️: click đầu tiên chờ 300ms rồi LẬT CARD (xem meme); click
  // thứ 2 trong khoảng đó thì auto-react thay vì lật.
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleImageClick = () => {
    if (tapTimerRef.current) {
      // Second tap → heart, huỷ lật card
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      onToggleReaction("❤️");
    } else {
      // First tap → chờ, nếu không có tap nữa thì lật card xem meme
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        setFlipped(true);
      }, DOUBLE_TAP_MS);
    }
  };

  return (
    /* 3D flip: front = ảnh moment, back = danh sách meme như bình luận. */
    <div className="relative h-full w-full perspective-[1600px]">
      <div
        className={cn(
          "relative h-full w-full transition-transform duration-500 transform-3d",
          flipped && "rotate-y-180",
        )}
      >
        {/* ── MẶT TRƯỚC: ảnh + overlay đầy đủ ── */}
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border/50 backface-hidden">
          {/* ── Ảnh TRÀN VIỀN card theo template (double-tap → tim, 1 tap → lật xem meme) ── */}
          <TemplateMedia
            moment={moment}
            t={t}
            onImageClick={() => handleImageClick()}
          />

          {/* Gradient đáy cho caption + reactions đọc rõ */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-linear-to-t from-black/60 via-black/25 to-transparent" />

          {/* ── Góc TRÊN TRÁI: avatar (stack) + tên (+N người) (+ time) ── */}
          <div className="absolute top-2.5 left-2.5 z-20 flex max-w-[calc(100%-8rem)] items-center gap-1.5">
            <div className="flex shrink-0 -space-x-1.5">
              {participants.slice(0, 3).map((p) => (
                <Avatar
                  key={p.userId}
                  size="sm"
                  className="shrink-0 ring-2 ring-white/70"
                >
                  {p.userAvatarUrl ? (
                    <AvatarImage src={p.userAvatarUrl} alt={p.userName} />
                  ) : null}
                  <AvatarFallback>{getInitials(p.userName)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="inline-flex min-w-0 flex-1 items-center gap-1">
              <span className="truncate rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                {participants.length > 1
                  ? t("moments.collabMembers", {
                      name: participants[0].userName,
                      count: participants.length - 1,
                    })
                  : moment.userName}
              </span>
              {moment.isOwn && (
                <Badge
                  variant="secondary"
                  className="shrink-0 px-1.5 py-0 text-[10px]"
                >
                  {t("moments.you")}
                </Badge>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-white/70 drop-shadow">
              <Clock3 className="size-3" />
              {timeAgo(moment.createdAt, t)}
            </span>
          </div>

          {/* Góc TRÊN GIỮA: badge thời lượng video */}
          {isVideo && (
            <span className="absolute top-2.5 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
              <Play className="size-3 fill-current" />
              {moment.durationSeconds
                ? `${Math.max(1, Math.round(moment.durationSeconds))}s`
                : t("moments.video")}
            </span>
          )}

          {/* ── Góc TRÊN PHẢI: nút xem meme (lật thẻ) + count ── */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFlipped(true);
            }}
            className="absolute top-2.5 right-2.5 z-30 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
            title={t("moments.memeTitle")}
          >
            <Sticker className="size-3.5" />
            {moment.memeCount ?? 0}
          </button>

          {/* ── Caption — phía DƯỚI, trên cụm reaction ── */}
          {moment.caption && (
            <p className="pointer-events-none absolute inset-x-6 bottom-14 z-20 line-clamp-2 text-center text-sm leading-snug font-medium text-white drop-shadow">
              {moment.caption}
            </p>
          )}

          {/* ── Reaction overlay: nút react + bubbles trái-dưới ── */}
          <MomentReactions
            moment={moment}
            onToggleReaction={onToggleReaction}
          />

          {/* ── Dưới PHẢI: stack dọc — nút xóa/rời (dưới cùng) ── */}
          <div className="pointer-events-auto absolute right-2.5 bottom-2.5 z-20 flex flex-col items-center gap-1.5">
            {moment.isOwn && onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="grid size-10 place-items-center rounded-full bg-black/50 text-white/80 shadow-lg backdrop-blur-sm transition hover:bg-destructive/80 hover:text-white"
                aria-label={t("moments.delete")}
                title={t("moments.delete")}
              >
                <Trash2 className="size-5" />
              </button>
            ) : moment.isParticipant && onLeave ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLeave();
                }}
                className="grid size-10 place-items-center rounded-full bg-black/50 text-white/80 shadow-lg backdrop-blur-sm transition hover:bg-foreground/70 hover:text-white"
                aria-label={t("moments.leave")}
                title={t("moments.leave")}
              >
                <UserMinus className="size-5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ── MẶT SAU: danh sách meme (flip back) ── */}
        <div className="absolute inset-0 z-30 overflow-hidden rounded-2xl backface-hidden rotate-y-180">
          <MomentMemePanel moment={moment} onBack={() => setFlipped(false)} />
        </div>
      </div>
    </div>
  );
};
