import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { ArrowLeft, Check, GalleryHorizontalEnd, Heart, Loader2, Play, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import {
  formatDate,
  formatDuration,
  storageQueryKey,
  trashQueryKey,
  type MediaListItem,
  type SwipeAction,
} from "@tng/shared";

import { Button } from "@/components/ui/button";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";
import { APP_DURATION, EASE_OUT } from "@/lib/motion";
import { TRASH_PATH } from "@/features/trash/trashPath";
import { useSwipeReview } from "./useSwipeReview";

/** Kéo quá 28% bề rộng thẻ hoặc vuốt nhanh = quyết định. */
const SWIPE_RATIO = 0.28;
const SWIPE_VELOCITY = 600;

/**
 * "Vuốt để dọn" (`/albums/review`): xem từng ảnh, mới nhất trước — kéo / ← = vào Thùng rác,
 * kéo / → = giữ, kéo lên / ↑ = thả tim (rồi sang ảnh sau), Ctrl+Z = hoàn tác. Xoá là xoá mềm nên vuốt nhầm vẫn khôi phục được.
 */
export const SwipeReviewView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { items, decisions, hasMore, loading, loadFailed, writeErrors, start, loadMore, decide, undo } =
    useSwipeReview();
  // Thẻ vừa rời đi bay về đâu — AnimatePresence `custom` cho exit (null = hoàn tác, chỉ mờ đi).
  const [direction, setDirection] = useState<SwipeAction | null>(null);

  useEffect(() => {
    void start();
  }, [start]);

  // Rời trang → làm mới lưới ảnh, Thùng rác, dung lượng, album / nhãn.
  const changed = useRef(false);
  useEffect(() => {
    if (decisions.some((d) => d.action !== "keep")) changed.current = true;
  }, [decisions]);
  useEffect(
    () => () => {
      if (!changed.current) return;
      for (const queryKey of [galleryQueryPrefix, trashQueryKey, storageQueryKey, ["albums"], ["labels"], ["favorites"]])
        void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient],
  );

  const current = items[decisions.length];
  const next = items[decisions.length + 1];
  const trashed = decisions.filter((d) => d.action === "trash").length;
  const liked = decisions.filter((d) => d.action === "favorite").length;

  const act = (action: SwipeAction) => {
    if (!current) return;
    setDirection(action);
    decide(action);
  };
  const back = () => {
    setDirection(null);
    undo();
  };

  // Giữ hàm mới nhất cho listener phím (đăng ký 1 lần).
  const keys = useRef({ act, back });
  keys.current = { act, back };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") keys.current.act("trash");
      else if (e.key === "ArrowRight") keys.current.act("keep");
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        keys.current.act("favorite");
      }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        keys.current.back();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const waiting = !current && (loading || (hasMore && !loadFailed));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3 self-start">
        <Link to="/albums">
          <ArrowLeft className="size-4" />
          {t("albums.title")}
        </Link>
      </Button>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <GalleryHorizontalEnd className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("review.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("review.stats", { trashed, liked, kept: decisions.length - trashed - liked })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={back} disabled={decisions.length === 0}>
          <Undo2 className="size-3.5" />
          {t("review.undo")}
        </Button>
      </div>

      <div className="relative aspect-[3/4] w-full">
        {next && <CardFace item={next} className="scale-95 opacity-60" />}
        <AnimatePresence custom={direction} initial={false}>
          {current && <SwipeCard key={current.id} item={current} onDecide={act} />}
        </AnimatePresence>

        {!current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed text-center">
            {waiting ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : loadFailed ? (
              <>
                <p className="text-sm text-muted-foreground">{t("review.loadFailed")}</p>
                <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                  {t("trash.retry")}
                </Button>
              </>
            ) : items.length === 0 ? (
              <p className="px-6 text-sm text-muted-foreground">{t("review.empty")}</p>
            ) : (
              <>
                <p className="font-heading text-xl">{t("review.done")}</p>
                <p className="px-8 text-sm text-muted-foreground">{t("review.doneDesc")}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void start()}>
                    <RotateCcw className="size-3.5" />
                    {t("review.restart")}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={TRASH_PATH}>
                      <Trash2 className="size-3.5" />
                      {t("review.openTrash")}
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {current && (
        <p className="mt-3 truncate text-center text-xs text-muted-foreground">
          {formatDate(current.takenAt ?? current.createdAt, i18n.language)}
          {current.title ? ` · ${current.title}` : ""}
        </p>
      )}

      <div className="mt-4 flex items-center justify-center gap-6">
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full text-destructive"
          disabled={!current}
          onClick={() => act("trash")}
          aria-label={t("review.trash")}
          title={t("review.trash")}
        >
          <X className="size-6" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-12 rounded-full text-rose-500"
          disabled={!current}
          onClick={() => act("favorite")}
          aria-label={t("review.favorite")}
          title={t("review.favorite")}
        >
          <Heart className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full"
          disabled={!current}
          onClick={() => act("keep")}
          aria-label={t("review.keep")}
          title={t("review.keep")}
        >
          <Check className="size-6" />
        </Button>
      </div>
      <p className="mt-3 hidden text-center text-xs text-muted-foreground sm:block">{t("review.hint")}</p>
      {writeErrors > 0 && (
        <p role="alert" className="mt-2 text-center text-xs text-destructive">
          {t("review.writeFailed")}
        </p>
      )}
    </div>
  );
};

/** Ảnh trong thẻ: bản display (≤ 2048 px), video = poster + thời lượng. */
const CardFace: React.FC<{ item: MediaListItem; className?: string; children?: React.ReactNode }> = ({
  item,
  className,
  children,
}) => (
  <div className={`absolute inset-0 overflow-hidden rounded-3xl border bg-muted ${className ?? ""}`}>
    <img
      src={item.displayUrl ?? item.thumbnailUrlLarge ?? item.thumbnailUrl}
      alt={item.title ?? ""}
      draggable={false}
      className="size-full object-contain"
    />
    {item.mediaType === "video" && (
      <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        <Play className="size-3 fill-current" />
        {formatDuration(item.durationSeconds)}
      </span>
    )}
    {item.isFavorite && (
      <Heart className="absolute right-3 bottom-3 size-5 fill-rose-500 text-rose-500 drop-shadow" />
    )}
    {children}
  </div>
);

const EXIT: Record<SwipeAction, { x: number; y: number }> = {
  trash: { x: -600, y: 0 },
  keep: { x: 600, y: 0 },
  favorite: { x: 0, y: -800 },
};

const SwipeCard: React.FC<{ item: MediaListItem; onDecide: (action: SwipeAction) => void }> = ({
  item,
  onDecide,
}) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-12, 12]);
  const trashOpacity = useTransform(x, [-120, -30], [1, 0]);
  const keepOpacity = useTransform(x, [30, 120], [0, 1]);
  const likeOpacity = useTransform(y, [-120, -30], [1, 0]);

  const onDragEnd = (e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const width = (e.target as HTMLElement | null)?.closest("[data-swipe-card]")?.clientWidth ?? 360;
    const limit = width * SWIPE_RATIO;
    const up = -info.offset.y > Math.abs(info.offset.x);
    if (up && (-info.offset.y > limit || info.velocity.y < -SWIPE_VELOCITY)) onDecide("favorite");
    else if (up) return;
    else if (info.offset.x < -limit || info.velocity.x < -SWIPE_VELOCITY) onDecide("trash");
    else if (info.offset.x > limit || info.velocity.x > SWIPE_VELOCITY) onDecide("keep");
  };

  return (
    <motion.div
      data-swipe-card
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate: reduce ? 0 : rotate }}
      drag
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit="exit"
      variants={{
        exit: (dir: SwipeAction | null) =>
          reduce || !dir
            ? { opacity: 0, transition: { duration: APP_DURATION.fast } }
            : { ...EXIT[dir], opacity: 0, transition: { duration: APP_DURATION.base, ease: EASE_OUT } },
      }}
      transition={{ duration: APP_DURATION.fast }}
    >
      <CardFace item={item}>
        <motion.span
          style={{ opacity: trashOpacity }}
          className="absolute top-5 right-5 rounded-lg border-2 border-destructive bg-background/80 px-3 py-1 text-sm font-bold text-destructive uppercase"
        >
          {t("review.trash")}
        </motion.span>
        <motion.span
          style={{ opacity: keepOpacity }}
          className="absolute top-5 left-5 rounded-lg border-2 border-foreground bg-background/80 px-3 py-1 text-sm font-bold uppercase"
        >
          {t("review.keep")}
        </motion.span>
        <motion.span
          style={{ opacity: likeOpacity }}
          className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border-2 border-rose-500 bg-background/80 px-3 py-1 text-sm font-bold text-rose-500 uppercase"
        >
          <Heart className="size-4 fill-current" />
          {t("review.favorite")}
        </motion.span>
      </CardFace>
    </motion.div>
  );
};
