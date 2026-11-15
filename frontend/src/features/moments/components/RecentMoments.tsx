import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Clock3, Plus } from "lucide-react";
import { getInitials, isMomentUnseen, MOMENT_MAX_PHOTOS, momentPeople, momentPictures, resolveMediaUrl } from "@tng/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { momentsFeedOptions } from "../momentsQuery";
import { useMomentsSeen } from "../useMomentsSeen";

/** Tiles shown (the newest of the first feed page). */
const MAX = 12;

/**
 * Gallery strip "Recent moments" (same as the mobile Library header): a "+" tile
 * (Camera, Moment mode) then the newest moments as 3:4 tiles (the card's ratio) —
 * every photo of the moment stacked like the card (≤ 3), the people's avatars
 * (≤ 3) on the corner, foreground ring = not seen yet — scrolling sideways. A tile opens the
 * Moments page at that moment (`/moments?id=`). Hidden while loading the first
 * time and when there are no moments (the gallery stays clean).
 */
export function RecentMoments() {
  const { t } = useTranslation();
  const feed = useInfiniteQuery(momentsFeedOptions);
  const seenUntil = useMomentsSeen((s) => s.seenUntil);
  const moments = useMemo(() => (feed.data?.pages[0]?.items ?? []).slice(0, MAX), [feed.data]);

  if (feed.isPending) return <RecentMomentsSkeleton />;
  if (!moments.length) return null;

  return (
    <section aria-labelledby="recent-moments" className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 id="recent-moments" className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock3 className="size-4 text-muted-foreground" />
          {t("moments.recent")}
        </h3>
        <Link to="/moments" className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
          {t("moments.seeAll")}
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          to="/camera?mode=moments"
          className="group flex w-20 shrink-0 flex-col items-center gap-1.5"
          aria-label={t("camera.momentsMode")}
        >
          <span className="grid aspect-[3/4] w-20 place-items-center rounded-2xl border-2 border-dashed border-foreground/25 bg-foreground/5 text-foreground transition-colors group-hover:border-foreground/45 group-hover:bg-foreground/10">
            <Plus className="size-6" />
          </span>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground">{t("camera.momentsShort")}</span>
        </Link>

        {moments.map((m) => {
          const unseen = isMomentUnseen(m, seenUntil);
          const people = momentPeople(m).slice(0, MOMENT_MAX_PHOTOS);
          return (
            <Link
              key={m.id}
              to={`/moments?id=${encodeURIComponent(m.id)}`}
              className="group flex w-20 shrink-0 flex-col items-center gap-1.5"
              aria-label={t("moments.open", { name: m.userName })}
            >
              <span
                className={cn(
                  "relative block aspect-[3/4] w-20 rounded-2xl p-0.5 ring-2 transition-transform group-hover:scale-[1.03]",
                  unseen ? "ring-foreground" : "ring-transparent",
                )}
              >
                <span className="flex size-full flex-col gap-px overflow-hidden rounded-[14px] bg-muted">
                  {momentPictures(m).map((src, i) => (
                    <span key={i} className="relative min-h-0 flex-1 bg-muted">
                      {/* absolute: the image must not size its slot, or the 3:4 tile grows to the photos' ratios */}
                      {src && <img src={resolveMediaUrl(src)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
                    </span>
                  ))}
                </span>
                <span className="absolute -right-1 -bottom-1 flex flex-row-reverse">
                  {people.map((p, i) => (
                    <Avatar key={p.userId} size="sm" className={cn("ring-2 ring-background", i > 0 && "-mr-2")}>
                      {p.userAvatarUrl && <AvatarImage src={resolveMediaUrl(p.userAvatarUrl)} alt="" />}
                      <AvatarFallback className="text-[9px]">{getInitials(p.userName)}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              </span>
              <span className={cn("w-full truncate text-center text-[11px]", unseen ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {m.isOwn ? t("moments.you") : m.userName}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecentMomentsSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <Skeleton className="h-4 w-36" />
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-20 shrink-0 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
