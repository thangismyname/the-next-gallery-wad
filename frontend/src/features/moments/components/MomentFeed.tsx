import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { MOMENT_ASPECT, isMomentUnseen, type Moment } from "@tng/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useElementSize } from "../useElementSize";
import { CARD_CHROME } from "../momentCard";
import { MomentCard } from "./MomentCard";

type Props = {
  moments: Moment[];
  isPending: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  onRetry: () => void;
  /** Moments are filtered (a person / me) → different empty text. */
  filtered: boolean;
  /** Changes when the filter changes → back to the first page. */
  filterKey: string;
  /** "Seen until" mark the feed opened with (New badges). */
  seenUntil: string | null;
  /** Open at this moment once it's loaded (`?id=` from the Gallery strip). */
  openId?: string | null;
  /** A card became the current page. */
  onViewed: (moment: Moment) => void;
  onDelete: (moment: Moment) => void;
  onLeave?: (moment: Moment) => void;
  onToggleReaction: (moment: Moment, emoji: string) => void;
  onNew: () => void;
};

/** Widest the square picture gets (desktop). */
const CARD_MAX = 560;
/** Vertical breathing room of a page. */
const PAGE_PAD = 24;
/**
 * BottomBar là `fixed` trên mobile → chừa chỗ ở đáy để thẻ không bị thanh nav đè.
 * Đặt ở phần tử ĐO ĐƯỢC để chiều cao tính toán đã trừ sẵn.
 */
const BOTTOM_RESERVE = "pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0";

/** Sentinel cho infinite scroll — tự tải trang kế khi cuộn gần cuối feed. */
const InfiniteScrollSentinel: React.FC<{
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  /** Vùng cuộn thật (tránh root = viewport khi feed cuộn bên trong). */
  rootRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ hasNextPage, fetchNextPage, isFetchingNextPage, rootRef }) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Giữ callback mới nhất nhưng KHÔNG đưa vào deps → observer không bị tạo lại
  // mỗi lần react-query render (tránh vòng fetch lặp).
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  useEffect(() => {
    const node = sentinelRef.current;
    // Đang tải trang kế → ngắt observer, nối lại khi xong (IO bắn lại trạng thái
    // ban đầu nên vẫn tự tải tiếp nếu sentinel còn trong vùng nhìn).
    if (!hasNextPage || !node || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchRef.current();
      },
      { root: rootRef?.current ?? null, rootMargin: "400px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, rootRef]);

  if (!hasNextPage) return null;

  return (
    <div ref={sentinelRef} className="flex shrink-0 justify-center py-4">
      {isFetchingNextPage && (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
};

/**
 * Feed = vertical snap pager, **one moment per page** (same as mobile): the card
 * is centered and sized to the room left (square side = min(width, height −
 * card chrome) ÷ aspect, 560). ↑/↓/PageUp/PageDown/Space or the side buttons move one
 * page; only the current page ± 1 is mounted (video + images stay light).
 */
export const MomentFeed: React.FC<Props> = ({
  moments,
  isPending,
  isError,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onRetry,
  filtered,
  filterKey,
  seenUntil,
  openId,
  onViewed,
  onDelete,
  onLeave,
  onToggleReaction,
  onNew,
}) => {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const { ref: boxRef, width: boxW, height: boxH } = useElementSize<HTMLDivElement>();
  const size = Math.max(200, Math.min(CARD_MAX, boxW - 32, Math.floor((boxH - PAGE_PAD * 2 - CARD_CHROME) / MOMENT_ASPECT)));
  const count = moments.length;

  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () =>
      setCurrent(Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / Math.max(1, el.clientHeight)))));
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count]);

  // The current page counts as seen (moves the "seen until" mark).
  const currentMoment = moments[current];
  useEffect(() => {
    if (currentMoment) onViewed(currentMoment);
  }, [currentMoment, onViewed]);

  // `openId` → jump to that page once (instant), when it's in the loaded list.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!openId || openedRef.current === openId || !el) return;
    const index = moments.findIndex((m) => m.id === openId);
    if (index < 0) return;
    openedRef.current = openId;
    el.scrollTo({ top: index * el.clientHeight });
  }, [openId, moments]);

  // A new filter → back to the first page (not when new moments arrive).
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  const goTo = useCallback(
    (index: number) => {
      const el = scrollerRef.current;
      if (!el || index < 0 || index >= count) return;
      el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
    },
    [count],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog], [role=menu], button, a")) return;
      let next: number | null = null;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "j") next = current + 1;
      else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") next = current - 1;
      if (next === null || next < 0 || next >= count) return;
      e.preventDefault();
      goTo(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, count, goTo]);

  const placeholder = (
    <div className="flex flex-col gap-3" style={{ width: size }}>
      <Skeleton className="h-9 w-40 rounded-full" />
      <Skeleton className="rounded-[2.25rem]" style={{ width: size, height: size * MOMENT_ASPECT }} />
      <Skeleton className="h-12 rounded-full" />
    </div>
  );

  return (
    <div className="relative h-full">
      <div ref={boxRef} className={`h-full ${BOTTOM_RESERVE}`}>
        {isPending ? (
          <div className="flex h-full items-center justify-center">{placeholder}</div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <p className="text-sm">{t("moments.loadFailed")}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("moments.retry")}
            </Button>
          </div>
        ) : count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <span className="grid size-14 place-items-center rounded-full bg-muted/60">
              <Camera className="size-6 text-muted-foreground/60 animate-float" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">{t(filtered ? "moments.emptyFiltered" : "moments.empty")}</p>
              {!filtered && <p className="text-sm">{t("moments.emptyHint")}</p>}
            </div>
            {!filtered && (
              <Button className="rounded-full" onClick={onNew}>
                {t("moments.newMoment")}
              </Button>
            )}
          </div>
        ) : (
          <div
            ref={scrollerRef}
            className="flex h-full flex-col snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {moments.map((moment, index) => (
              <section
                key={moment.id}
                className="flex h-full shrink-0 snap-start snap-always items-center justify-center"
                style={{ padding: `${PAGE_PAD}px 16px` }}
                aria-current={index === current}
              >
                {Math.abs(index - current) <= 1 ? (
                  <MomentCard
                    moment={moment}
                    size={size}
                    active={index === current}
                    unseen={isMomentUnseen(moment, seenUntil)}
                    onDelete={() => onDelete(moment)}
                    onLeave={onLeave ? () => onLeave(moment) : undefined}
                    onToggleReaction={(emoji) => onToggleReaction(moment, emoji)}
                  />
                ) : (
                  placeholder
                )}
              </section>
            ))}
            <InfiniteScrollSentinel
              hasNextPage={hasNextPage}
              fetchNextPage={fetchNextPage}
              isFetchingNextPage={isFetchingNextPage}
              rootRef={scrollerRef}
            />
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="absolute top-1/2 right-4 z-40 hidden -translate-y-1/2 flex-col items-center gap-1.5 md:flex">
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(current - 1)}
            disabled={current <= 0}
            className="rounded-full bg-background/80 backdrop-blur"
            aria-label={t("moments.prev")}
          >
            <ChevronUp className="size-4" />
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {Math.min(current + 1, count)}/{count}
            {hasNextPage ? "+" : ""}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(current + 1)}
            disabled={current >= count - 1}
            className="rounded-full bg-background/80 backdrop-blur"
            aria-label={t("moments.next")}
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export { InfiniteScrollSentinel };
