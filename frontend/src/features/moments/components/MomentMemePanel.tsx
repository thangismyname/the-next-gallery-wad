import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, Heart, Plus, Sticker, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteMomentMeme,
  fetchMomentMemes,
  momentMemesQueryKey,
  MomentMemePage,
  toggleMemeReaction,
} from "@/services/moments";
import { Moment, MomentMeme } from "@/types";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";
import { timeAgo } from "../participants";
import { MemePickerDialog } from "./MemePickerDialog";
import { bumpFeedMemeCount } from "../momentsCache";

type Props = {
  moment: Moment;
  /** Lật trở lại mặt trước (ảnh). */
  onBack: () => void;
};

const PAGE_SIZE = 20;

/**
 * MẶT SAU thẻ moment (khi lật) — danh sách meme về bức ảnh, scroll liên tục
 * như bình luận. Mỗi meme: avatar + tên + thời gian, ảnh meme, caption tùy
 * chọn. Dưới cùng là nút "Thả meme" mở MemePickerDialog (template memegen.link).
 */
export const MomentMemePanel: React.FC<Props> = ({ moment, onBack }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isPending,
    isError,
    refetch,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: momentMemesQueryKey(moment.id),
    queryFn: ({ pageParam }) =>
      fetchMomentMemes(moment.id, pageParam ?? 0, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.hasMore ? last.offset + last.limit : undefined,
    staleTime: 30_000,
  });

  const memes = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  // Infinite scroll như bình luận: khi thấy sentinel đáy → load thêm.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!hasNextPage || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      { root: null, rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Sửa list meme trong cache theo từng trang (thêm/xóa/patch 1 meme).
  const updateMemePages = (
    fn: (items: MomentMeme[], pageIndex: number) => MomentMeme[],
  ) => {
    queryClient.setQueryData<InfiniteData<MomentMemePage>>(
      momentMemesQueryKey(moment.id),
      (old) =>
        old && {
          ...old,
          pages: old.pages.map((page, i) => ({
            ...page,
            items: fn(page.items, i),
          })),
        },
    );
  };

  const handleCreated = (meme: MomentMeme) => {
    updateMemePages((items, i) => (i === 0 ? [meme, ...items] : items));
    bumpFeedMemeCount(queryClient, moment.id, 1);
    setPickerOpen(false);
  };

  const handleDelete = async (meme: MomentMeme) => {
    if (!window.confirm(t("moments.memeDeleteConfirm"))) return;
    try {
      await deleteMomentMeme(moment.id, meme.id);
      updateMemePages((items) => items.filter((x) => x.id !== meme.id));
      bumpFeedMemeCount(queryClient, moment.id, -1);
    } catch {
      window.alert(t("moments.memeDeleteFailed"));
    }
  };

  // Cập nhật reactCount + myReact của 1 meme trong cache list.
  const patchMemeReaction = (
    memeId: string,
    patch: { myReact: boolean; reactCount: number },
  ) => {
    updateMemePages((items) =>
      items.map((m) => (m.id === memeId ? { ...m, ...patch } : m)),
    );
  };

  // Tim (❤️) meme — optimistic: đổi UI ngay, sau đó khớp đúng từ API.
  const handleReact = async (meme: MomentMeme) => {
    const before = { myReact: meme.myReact, reactCount: meme.reactCount };
    const optimistic = {
      myReact: !before.myReact,
      reactCount: before.reactCount + (before.myReact ? -1 : 1),
    };
    patchMemeReaction(meme.id, optimistic);
    try {
      const state = await toggleMemeReaction(moment.id, meme.id);
      patchMemeReaction(meme.id, state);
    } catch {
      patchMemeReaction(meme.id, before);
    }
  };

  return (
    <>
      <div className="absolute inset-0 flex flex-col bg-zinc-950 text-zinc-100">
        {/* ── Header: quay lại + tiêu đề + count ── */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-2">
          <button
            type="button"
            onClick={onBack}
            className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"
            aria-label={t("moments.memeBack")}
            title={t("moments.memeBack")}
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <Sticker className="size-4 shrink-0" />
            <span className="truncate">{t("moments.memeTitle")}</span>
            <span className="shrink-0 text-xs font-normal text-zinc-400">
              ({moment.memeCount ?? 0})
            </span>
          </span>
        </div>

        {/* ── Danh sách meme — scroll vô hạn ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-thin [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">
          {isPending && (
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 shrink-0 rounded-full bg-white/10" />
                    <Skeleton className="h-3 w-24 bg-white/10" />
                  </div>
                  <Skeleton className="h-24 w-full rounded-xl bg-white/10" />
                </div>
              ))}
            </div>
          )}

          {!isPending && isError && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-zinc-400">
              <p>{t("moments.memeLoadFailed")}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-full bg-white/10 px-3 py-1 transition hover:bg-white/20"
              >
                {t("moments.retry")}
              </button>
            </div>
          )}

          {!isPending && !isError && memes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-white/10">
                <Sticker className="size-5 text-zinc-400" />
              </span>
              <p className="text-sm text-zinc-200">{t("moments.memeEmpty")}</p>
              <p className="text-xs text-zinc-500">
                {t("moments.memeEmptyHint")}
              </p>
            </div>
          )}

          <div className="space-y-5">
            {memes.map((meme) => {
              // Avatar nằm ở KHOẢNG TRỐNG bên cạnh ảnh (tác giả moment → PHẢI,
              // người khác → TRÁI). Phía ĐỐI DIỆN hiện nút TIm (❤️) + số lượng.
              // Tên + thời gian + nút xóa nằm dưới meme, căn theo phía avatar.
              const isMomentAuthor = meme.userId === moment.userId;
              const avatar = (
                <Avatar size="sm" className="shrink-0">
                  {meme.userAvatarUrl ? (
                    <AvatarImage src={meme.userAvatarUrl} alt={meme.userName} />
                  ) : null}
                  <AvatarFallback>{getInitials(meme.userName)}</AvatarFallback>
                </Avatar>
              );
              const heart = (
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleReact(meme)}
                    aria-label={
                      meme.myReact
                        ? t("moments.memeUnreact")
                        : t("moments.memeReact")
                    }
                    aria-pressed={meme.myReact}
                    title={
                      meme.reactNames.length > 0
                        ? meme.reactNames.join(", ")
                        : t("moments.memeReact")
                    }
                    className={cn(
                      "grid size-8 place-items-center rounded-full transition active:scale-90",
                      meme.myReact
                        ? "bg-red-500/15"
                        : "bg-white/5 hover:bg-white/10",
                    )}
                  >
                    <Heart
                      className={cn(
                        "size-4 transition",
                        meme.myReact
                          ? "fill-red-500 text-red-500"
                          : "text-zinc-400 hover:text-red-400",
                      )}
                    />
                  </button>
                  {meme.reactCount > 0 && (
                    <span
                      className={cn(
                        "text-[10px] leading-none",
                        meme.myReact ? "text-red-400" : "text-zinc-400",
                      )}
                    >
                      {meme.reactCount}
                    </span>
                  )}
                </div>
              );
              return (
                <div key={meme.id} className="space-y-1.5">
                  <div className="flex gap-2">
                    {/* Gap TRÁI: avatar (người khác) hoặc heart (tác giả) */}
                    <div className="flex w-10 shrink-0 items-center justify-center self-stretch">
                      {isMomentAuthor ? heart : avatar}
                    </div>

                    {/* Ảnh meme — căn giữa. Bấm vào → lật về mặt moment. */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={onBack}
                        className="block w-full"
                        title={t("moments.memeBack")}
                      >
                        <span className="grid size-full h-44 w-full place-items-center overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                          <img
                            src={meme.imageUrl}
                            alt={meme.caption ?? meme.userName}
                            loading="lazy"
                            className="size-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </span>
                      </button>

                      {meme.caption && (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap wrap-break-word text-zinc-300">
                          {meme.caption}
                        </p>
                      )}
                    </div>

                    {/* Gap PHẢI: heart (người khác) hoặc avatar (tác giả) */}
                    <div className="flex w-10 shrink-0 items-center justify-center self-stretch">
                      {isMomentAuthor ? avatar : heart}
                    </div>
                  </div>

                  {/* Tên + thời gian + xóa — dưới meme, căn theo phía avatar */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-x-1.5",
                      isMomentAuthor && "flex-row-reverse",
                    )}
                  >
                    <p className="max-w-full truncate text-[11px] font-medium text-zinc-100">
                      {meme.userName}
                    </p>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {timeAgo(meme.createdAt, t)}
                    </span>
                    {meme.isOwn && (
                      <button
                        type="button"
                        onClick={() => handleDelete(meme)}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-red-400"
                        aria-label={t("moments.memeDelete")}
                        title={t("moments.memeDelete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="py-2">
            {isFetchingNextPage && (
              <Skeleton className="h-20 w-full rounded-xl bg-white/5" />
            )}
          </div>
        </div>

        {/* ── Composer: nút thả meme ── */}
        <div className="shrink-0 border-t border-white/10 p-2.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white/10 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-white/15 active:scale-[0.98]"
          >
            <Plus className="size-4" />
            {t("moments.memeAdd")}
          </button>
        </div>
      </div>

      <MemePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        momentId={moment.id}
        onCreated={handleCreated}
      />
    </>
  );
};
