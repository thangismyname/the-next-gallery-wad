import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Heart, MoreHorizontal, Pencil, Sticker, Trash2, UserMinus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MOMENT_ASPECT, getInitials, resolveMediaUrl, type Moment } from "@tng/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { POP_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { patchMoment } from "@/services/moments";
import { getMomentParticipants, timeAgo } from "../participants";
import { patchFeedMoment } from "../momentsCache";
import { QUICK_EMOJIS } from "../momentCard";
import { MomentMemePanel } from "./MomentMemePanel";
import { TemplateMedia } from "./TemplateMedia";

const DOUBLE_TAP_MS = 300;
const HOLD_MS = 350;
/** Clicks on these inside the meme side do their own thing (don't flip back). */
const INTERACTIVE = "button, a, input, textarea, [role=button], [role=menuitem]";

type Props = {
  moment: Moment;
  /** Side of the square picture (px). */
  size: number;
  /** Current page of the feed (other pages turn back to the picture). */
  active: boolean;
  unseen: boolean;
  onDelete?: () => void;
  onLeave?: () => void;
  onToggleReaction: (emoji: string) => void;
};

/**
 * One moment, same layout as the mobile card: who · when (+ "New") · ⋯ above;
 * the square picture carries only the caption. **Click = flip** to the memes on
 * the back (the list scrolls; clicking a non-control there flips back),
 * double-click = ❤️. Below: ONE reaction button (click = ❤️ / take mine back,
 * hold or right-click = pick another emoji), who reacted, the Meme button.
 */
export function MomentCard({ moment, size, active, unseen, onDelete, onLeave, onToggleReaction }: Props) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const participants = getMomentParticipants(moment);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(moment.caption ?? "");
  const [editVisibility, setEditVisibility] = useState(moment.visibility ?? "circle");
  const [saving, setSaving] = useState(false);
  const [burst, setBurst] = useState(0);
  // Card angle: each turn adds a half-turn to the left (turning back keeps the
  // same direction instead of spinning backwards). Odd multiples of 180 = memes.
  const [angle, setAngle] = useState(0);
  const flipped = Math.abs(Math.round(angle / 180)) % 2 === 1;
  // The back (meme list + its query) mounts on the first flip only.
  const [everFlipped, setEverFlipped] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  // Paged away → back to the picture (adjusting state while rendering, no effect).
  if (!active && flipped) setAngle(angle - 180);

  const author = moment.isOwn ? t("moments.you") : moment.userName;
  const names =
    participants.length > 1 ? t("moments.collabMembers", { name: author, count: participants.length - 1 }) : author;
  const memes = moment.memeCount ?? 0;

  /** Click / Meme button: one more half-turn to the left. */
  const flip = () => {
    setEverFlipped(true);
    setAngle((a) => a - 180);
  };
  /** Back to the picture (from the meme side), continuing the same way. */
  const toFront = () => {
    if (flipped) setAngle(angle - 180);
  };

  // Click = flip (after the double-click window), double-click = ❤️.
  const onPictureTap = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (moment.myReaction !== "❤️") onToggleReaction("❤️");
      setBurst((n) => n + 1);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      flip();
    }, DOUBLE_TAP_MS);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await patchMoment(moment.id, { caption: editCaption.trim() || null, visibility: editVisibility });
      patchFeedMoment(queryClient, moment.id, () => updated);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const canManage = moment.isOwn || (moment.isParticipant && onLeave);

  return (
    <article className="flex flex-col gap-3" style={{ width: size }} aria-label={t("moments.open", { name: moment.userName })}>
      {/* ── Who · when · menu ── */}
      <header className="flex items-center gap-2.5 px-1">
        <div className="flex shrink-0 -space-x-2">
          {participants.slice(0, 3).map((p) => (
            <Avatar key={p.userId} className="size-9 ring-2 ring-background">
              {p.userAvatarUrl && <AvatarImage src={resolveMediaUrl(p.userAvatarUrl)} alt="" />}
              <AvatarFallback className="text-xs">{getInitials(p.userName)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{names}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {timeAgo(moment.createdAt, t)}
            {unseen && (
              <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">
                {t("moments.new")}
              </span>
            )}
          </p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground" aria-label={t("moments.more")}>
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moment.isOwn && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditCaption(moment.caption ?? "");
                    setEditVisibility(moment.visibility ?? "circle");
                    setEditOpen(true);
                  }}
                >
                  <Pencil />
                  {t("moments.editCaption")}
                </DropdownMenuItem>
              )}
              {moment.isOwn && onDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 />
                  {t("moments.delete")}
                </DropdownMenuItem>
              ) : onLeave ? (
                <DropdownMenuItem variant="destructive" onSelect={onLeave}>
                  <UserMinus />
                  {t("moments.leave")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* ── Picture (front) ⇄ memes (back) — click to turn ── */}
      <div className="perspective-[1600px]" style={{ width: size, height: size * MOMENT_ASPECT }}>
        <div
          className="relative size-full transform-3d transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `rotateY(${angle}deg)` }}
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-[2.25rem] bg-muted ring-1 ring-border/50 backface-hidden"
            aria-hidden={flipped}
            inert={flipped}
          >
            <TemplateMedia moment={moment} t={t} onImageClick={onPictureTap} paused={flipped} />
            {moment.caption && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-6">
                <p className="line-clamp-2 max-w-full rounded-full bg-black/55 px-4 py-2 text-center text-sm font-semibold text-white backdrop-blur-sm">
                  {moment.caption}
                </p>
              </div>
            )}
            <AnimatePresence>
              {burst > 0 && !reduce && (
                <motion.div
                  key={burst}
                  className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.6, 1.1, 1] }}
                  transition={{ duration: 0.6 }}
                  onAnimationComplete={() => setBurst(0)}
                >
                  <Heart className="size-24 fill-white text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {everFlipped && (
            <div
              className="absolute inset-0 cursor-pointer overflow-hidden rounded-[2.25rem] ring-1 ring-border backface-hidden rotate-y-180"
              aria-hidden={!flipped}
              inert={!flipped}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest(INTERACTIVE)) toFront();
              }}
            >
              <MomentMemePanel moment={moment} onBack={toFront} />
            </div>
          )}
        </div>
      </div>

      {/* ── Reaction · who reacted · memes ── */}
      <div className="flex items-center gap-3">
        <ReactButton current={moment.myReaction} onReact={onToggleReaction} />
        <Reactors moment={moment} />
        <Button
          variant={flipped ? "default" : "secondary"}
          onClick={flip}
          aria-pressed={flipped}
          className="h-12 shrink-0 gap-1.5 rounded-full px-4"
          aria-label={t("moments.flipToMemes")}
        >
          <Sticker className="size-5" />
          {memes > 0 ? <span className="tabular-nums">{memes}</span> : <span className="text-sm">{t("moments.memeTitle")}</span>}
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("moments.editCaption")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder={t("moments.captionPlaceholder")}
            />
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
              {(["circle", "private"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEditVisibility(v)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs",
                    editVisibility === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t(`moments.visibility${v === "circle" ? "Circle" : "Private"}`)}
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              {t("moments.cancel")}
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "..." : t("moments.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/**
 * ONE round reaction button: my emoji (or an empty heart). Click = ❤️ / take mine
 * back; press and hold (or right-click) = picker with the quick emojis + any emoji.
 */
function ReactButton({ current, onReact }: { current: string | null; onReact: (emoji: string) => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clearHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => clearHold, []);

  const pick = (emoji: string) => {
    onReact(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <motion.button
          type="button"
          aria-label={current ? `${t("moments.react")} ${current}` : t("moments.react")}
          title={t("moments.reactHint")}
          aria-pressed={!!current}
          aria-haspopup="dialog"
          aria-expanded={open}
          key={current ?? "none"}
          initial={reduce || !current ? false : { scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={POP_SPRING}
          onPointerDown={() => {
            held.current = false;
            clearHold();
            hold.current = setTimeout(() => {
              held.current = true;
              setOpen(true);
            }, HOLD_MS);
          }}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onContextMenu={(e) => {
            e.preventDefault();
            clearHold();
            setOpen(true);
          }}
          onClick={() => {
            // A hold already opened the picker → this click is its release.
            if (held.current) {
              held.current = false;
              return;
            }
            onReact(current ?? "❤️");
          }}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-[24px] transition-colors select-none hover:bg-muted/70"
        >
          {current ?? <Heart className="size-6" />}
        </motion.button>
      </PopoverAnchor>
      <PopoverContent side="top" align="start" className="w-auto gap-2 rounded-2xl p-2">
        <div className="flex gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              aria-pressed={emoji === current}
              aria-label={`${t("moments.react")} ${emoji}`}
              className={cn(
                "grid size-11 place-items-center rounded-full text-[26px] transition hover:scale-110",
                emoji === current ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const emoji = custom.trim();
            if (!emoji) return;
            setCustom("");
            pick(emoji);
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.slice(0, 8))}
            placeholder={t("moments.customEmoji")}
            aria-label={t("moments.customEmoji")}
            enterKeyHint="send"
            className="w-full rounded-xl bg-muted px-3 py-2 text-center text-lg outline-none"
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Avatars of the latest reactors + per-emoji counts. */
function Reactors({ moment }: { moment: Moment }) {
  const counts = moment.reactions.filter((r) => r.count > 0);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {moment.recentReactions.length > 0 && (
        <div className="flex shrink-0 -space-x-1.5">
          {moment.recentReactions.slice(0, 3).map((r) => (
            <Avatar key={r.userId} size="sm" className="ring-2 ring-background" title={`${r.userName} ${r.emoji ?? ""}`}>
              {r.userAvatarUrl && <AvatarImage src={resolveMediaUrl(r.userAvatarUrl)} alt="" />}
              <AvatarFallback className="text-[9px]">{getInitials(r.userName)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      )}
      <p className="truncate text-xs text-muted-foreground">{counts.map((r) => `${r.emoji} ${r.count}`).join("   ")}</p>
    </div>
  );
}
