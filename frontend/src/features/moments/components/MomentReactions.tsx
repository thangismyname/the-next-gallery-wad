import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SmilePlus } from "lucide-react";
import { Moment, MomentRecentReaction } from "@/types";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";

const QUICK_EMOJIS = ["😡", "😢", "😮", "😂", "❤️"];

/**
 * Bubble tròn NHỎ 2 mặt: mặt TRƯỚC = emoji, mặt SAU = avatar người react.
 * Tự lật vô hạn (CSS 3D flip), lệch pha nhẹ bằng animation-delay ÂM
 * (index * 0.2s, tối đa 0.8s) để đọc được list "ai đã tim".
 */
function ReactionBubble({
  reaction,
  index,
}: {
  reaction: MomentRecentReaction;
  index: number;
}) {
  const stagger = Math.min(index * 0.2, 0.8);

  return (
    <div
      className="reaction-flip-3d relative size-5.5 shrink-0"
      style={{ "--flip-delay": `${-stagger}s` } as React.CSSProperties}
      title={reaction.userName}
    >
      <div
        className="reaction-flip-card"
        style={{ animationDelay: `${-stagger}s` }}
      >
        {/* Mặt trước — emoji */}
        <div className="reaction-face absolute inset-0 grid size-full place-items-center overflow-hidden rounded-full bg-black/55 text-[12px] leading-none text-white shadow ring-1 ring-black/10 backdrop-blur-sm dark:ring-white/20">
          {reaction.emoji ?? "👍"}
        </div>

        {/* Mặt sau — avatar (dùng img/fallback thuần để vừa size 22px) */}
        <div className="reaction-face reaction-face-back absolute inset-0 size-full overflow-hidden rounded-full bg-muted shadow ring-1 ring-black/10 dark:ring-white/20">
          {reaction.userAvatarUrl ? (
            <img
              src={reaction.userAvatarUrl}
              alt={reaction.userName}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center bg-muted text-[9px] font-semibold text-muted-foreground">
              {getInitials(reaction.userName)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  moment: Moment;
  onToggleReaction: (emoji: string) => void;
};

/**
 * Bottom overlay trên ảnh moment (pointer-events-none default).
 *
 *   ┌──────────────────────────────────────┐
 *   │                     [popover emoji]  │  ← mở khi bấm nút react
 *   │      ┌───────────────────────────┐   │
 *   │      │ [😊] [😊][😂][❤️]         │   │ ← góc TRÁI: nút THẢ reaction,
 *   │      └───────────────────────────┘   │   bubbles "ai đã tim" kế BÊN PHẢI
 *   └──────────────────────────────────────┘
 *
 * - Cụm reaction neo GÓC TRÁI (left-2.5 bottom-2.5): nút react trước,
 *   hàng bubble nhỏ nằm ngay BÊN PHẢI nút, overflow-hidden giới hạn.
 * - Popover (hiện khi open): emoji + input gõ emoji bằng bàn phím,
 *   mở phía trên cụm, neo trái.
 * - Nút xóa/rời nằm ở góc phải-dưới: do MomentSlide dựng chung stack
 *   (nút delete/leave ở đáy).
 */
export const MomentReactions: React.FC<Props> = ({
  moment,
  onToggleReaction,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus input khi mở popover
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const myReaction = moment.myReaction;

  const submitCustomEmoji = (e: React.FormEvent) => {
    e.preventDefault();
    const emoji = customEmoji.trim();
    if (!emoji) return;
    onToggleReaction(emoji);
    setCustomEmoji("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20">
      {/* ── Cụm reaction — GÓC TRÁI: nút thả reaction + bubbles ngay BÊN PHẢI ── */}
      <div className="pointer-events-auto absolute bottom-2.5 left-2.5 z-20 flex max-w-[calc(100%-4.5rem)] items-center overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "size-10 shrink-0 grid place-items-center rounded-full text-lg shadow-lg transition",
            open
              ? "bg-background/95 text-foreground"
              : myReaction
                ? "bg-background/80 text-foreground"
                : "bg-black/55 text-white backdrop-blur-sm hover:bg-black/70",
          )}
          aria-label={t("moments.react")}
          title={t("moments.react")}
        >
          {myReaction ? (
            <span>{myReaction}</span>
          ) : (
            <SmilePlus className="size-5" />
          )}
        </button>

        {/* Bubbles "ai đã tim" — BÊN PHẢI nút react, MỚI → CŨ từ trái sang
            phải (created_at DESC từ backend), chồng nhau bằng -ml-1.5. */}
        {moment.recentReactions.length > 0 && (
          <div className="ml-1 flex min-w-0 items-center overflow-hidden">
            {moment.recentReactions.slice(0, 4).map((reaction, index) => (
              <div
                key={reaction.userId}
                className={index > 0 ? "-ml-1.5" : undefined}
                style={{ zIndex: moment.recentReactions.length - index }}
              >
                <ReactionBubble reaction={reaction} index={index} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Popover — phía TRÊN cụm reaction, neo TRÁI ── */}
      {open && (
        <div className="pointer-events-auto absolute bottom-16 left-2.5 z-30 w-44 origin-bottom-left overflow-hidden rounded-2xl bg-black/70 p-2 shadow-xl backdrop-blur-md">
          {/* Input gõ emoji bằng bàn phím */}
          <form onSubmit={submitCustomEmoji} className="mb-1">
            <input
              ref={inputRef}
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value.slice(0, 4))}
              placeholder={t("moments.customEmoji")}
              className="w-full rounded-xl border-none bg-white/15 px-3 py-2 text-center text-xl text-white placeholder-white/40 outline-none backdrop-blur-sm focus:bg-white/20"
              aria-label={t("moments.customEmoji")}
              maxLength={4}
              enterKeyHint="send"
            />
          </form>

          <div className="mx-auto mb-1 h-px w-10 bg-white/15" />

          {/* Quick emoji buttons */}
          <div className="grid grid-cols-5 gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggleReaction(emoji)}
                className={cn(
                  "grid size-9 place-items-center rounded-full text-xl transition hover:scale-110",
                  emoji === myReaction
                    ? "bg-white/25"
                    : "hover:bg-white/10",
                )}
                aria-label={emoji}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};