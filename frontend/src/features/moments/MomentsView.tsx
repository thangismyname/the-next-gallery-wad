import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { momentsFeedOptions } from "./momentsQuery";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteMoment, leaveMoment, reactToMoment, removeMomentReaction } from "@/services/moments";
import { feedPeople, filterMoments, type MomentFilter, momentMemesQueryKey, momentsFeedQueryKey, momentInvitationsQueryKey } from "@tng/shared";
import { MomentFilterBar } from "./components/MomentFilterBar";
import { useMomentsSeen } from "./useMomentsSeen";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";
import { Moment } from "@tng/shared";
import { MomentFeed } from "./components/MomentFeed";
import { CreateMomentDialog } from "./components/CreateMomentDialog";
import { MomentInviteButton } from "./components/MomentInviteButton";
import { useMomentEditStore } from "@/features/moments/useMomentEditStore";
import { authClient } from "@/services/authClient";
import {
  applyRemoteReaction,
  patchFeedMoment,
  removeFeedMoment,
  type RemoteReactionPayload,
} from "./momentsCache";

export const MomentsView: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [createOpen, setCreateOpen] = useState(false);
  // Tick mỗi phút để nhãn timeAgo tự cập nhật (P3.11).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const editDraft = useMomentEditStore((s) => s.editDraft);
  const setEditDraft = useMomentEditStore((s) => s.setEditDraft);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...momentsFeedOptions,
    // Feed là snap pager: refetch khi quay lại tab sẽ làm nhảy vị trí đang xem.
    refetchOnWindowFocus: false,
  });
  // `?id=` (Gallery "Moments gần đây") → mở đúng moment đó.
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("id");

  const allMoments = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  // Who to watch + "new since last visit" (mark frozen at open so badges stay).
  const me = session?.user ?? null;
  const [filter, setFilter] = useState<MomentFilter>("all");
  const [seenAtOpen] = useState(() => useMomentsSeen.getState().seenUntil);
  const markSeen = useMomentsSeen((s) => s.markSeen);
  const onViewed = useCallback((m: Moment) => markSeen(m.createdAt), [markSeen]);
  const people = useMemo(() => feedPeople(allMoments, me?.id ?? null, seenAtOpen), [allMoments, me?.id, seenAtOpen]);
  const moments = useMemo(() => filterMoments(allMoments, filter, me?.id ?? null), [allMoments, filter, me?.id]);
  const filterKey = typeof filter === "object" ? filter.userId : filter;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey });
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: momentInvitationsQueryKey });

  // Realtime meme: người khác thả/xóa/tim meme trên moment → cập nhật list
  // meme panel (+ memeCount ở feed khi thêm/xóa) mà không cần vuốt để refetch.
  const signaling = useSignaling();
  useEffect(() => {
    const feedKey = momentsFeedQueryKey;
    const invitationKey = momentInvitationsQueryKey;

    const onMemeEvent = (refreshFeed: boolean) => (payload: unknown) => {
      const p = payload as { momentId?: string };
      if (!p.momentId) return;
      void queryClient.invalidateQueries({
        queryKey: momentMemesQueryKey(p.momentId),
      });
      if (refreshFeed) {
        void queryClient.invalidateQueries({ queryKey: feedKey });
      }
    };

    // Người khác react / moment bị xoá / bị rời / đổi draft (P2.9).
    const onReaction = (payload: unknown) => {
      const p = payload as RemoteReactionPayload;
      if (!p?.momentId) return;
      // Áp trực tiếp vào cache; không đủ dữ liệu (moment chưa có trong feed,
      // chưa biết emoji cũ…) → refetch để đồng bộ lại.
      if (!applyRemoteReaction(queryClient, p)) {
        void queryClient.invalidateQueries({ queryKey: feedKey });
      }
    };

    const onDeleted = (payload: unknown) => {
      const p = payload as { momentId?: string };
      if (!p?.momentId) return;
      removeFeedMoment(queryClient, p.momentId);
      void queryClient.invalidateQueries({ queryKey: invitationKey });
    };

    const onChanged = () => {
      void queryClient.invalidateQueries({ queryKey: feedKey });
      void queryClient.invalidateQueries({ queryKey: invitationKey });
    };

    const offs = [
      signaling.on(SIGNAL.MOMENT_MEME_ADDED, onMemeEvent(true)),
      signaling.on(SIGNAL.MOMENT_MEME_REMOVED, onMemeEvent(true)),
      signaling.on(SIGNAL.MOMENT_MEME_REACTED, onMemeEvent(false)),
      signaling.on(SIGNAL.MOMENT_REACTION, onReaction),
      signaling.on(SIGNAL.MOMENT_DELETED, onDeleted),
      signaling.on(SIGNAL.MOMENT_LEFT, onChanged),
      signaling.on(SIGNAL.MOMENT_UPDATED, onChanged),
      signaling.on(SIGNAL.MOMENT_COLLAB_COMPLETE, onChanged),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling, queryClient]);

  // Xoá moment của mình / rời moment collab (gỡ ảnh của mình) — hỏi lại bằng
  // AlertDialog, lỗi hiện thành thông báo nhỏ (không dùng confirm/alert của trình duyệt).
  const [confirming, setConfirming] = useState<{ kind: "delete" | "leave"; moment: Moment } | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleDelete = (moment: Moment) => setConfirming({ kind: "delete", moment });
  const handleLeave = (moment: Moment) => setConfirming({ kind: "leave", moment });

  const runConfirmed = async () => {
    if (!confirming) return;
    setWorking(true);
    try {
      if (confirming.kind === "delete") {
        await deleteMoment(confirming.moment.id);
      } else {
        await leaveMoment(confirming.moment.id);
        invalidateInvitations();
      }
      invalidate();
      setConfirming(null);
    } catch (error) {
      setNotice(
        confirming.kind === "leave" && error instanceof Error && error.message
          ? error.message
          : t(confirming.kind === "delete" ? "moments.deleteFailed" : "moments.leaveFailed"),
      );
      setConfirming(null);
    } finally {
      setWorking(false);
    }
  };

  const handleToggleReaction = async (moment: Moment, emoji: string) => {
    const removing = moment.myReaction === emoji;
    try {
      if (removing) {
        await removeMomentReaction(moment.id);
      } else {
        await reactToMoment(moment.id, { emoji });
      }

      // Optimistic update: sửa ngay cache feed thay vì refetch toàn bộ.
      // `reactions` = { emoji, count }[]; `recentReactions` = người + emoji.
      patchFeedMoment(queryClient, moment.id, (m) => {
        const reactions = m.reactions.map((r) => ({ ...r }));
        const index = reactions.findIndex((r) => r.emoji === emoji);

        if (removing) {
          if (index >= 0) {
            if (reactions[index].count <= 1) reactions.splice(index, 1);
            else reactions[index].count -= 1;
          }
        } else if (index >= 0) {
          reactions[index].count += 1;
        } else {
          reactions.push({ emoji, count: 1 });
        }
        reactions.sort((a, b) => b.count - a.count);

        const recentReactions = removing
          ? m.recentReactions.filter((r) => r.emoji !== emoji)
          : [
              {
                emoji,
                userId: session?.user.id ?? m.userId,
                userName: session?.user.name ?? m.userName,
                userAvatarUrl: session?.user.image ?? null,
              },
              ...m.recentReactions.filter((r) => r.emoji !== emoji),
            ].slice(0, 4);

        return {
          ...m,
          myReaction: removing ? null : emoji,
          reactions,
          recentReactions,
        };
      });
    } catch {
      // silent — setQueriesData đã cập nhật UI; lần fetch sau sẽ đồng bộ lại.
      invalidate();
    }
  };

  return (
    <div className="absolute inset-0 bg-background text-foreground">
      <main className="flex h-full flex-col overflow-hidden">
        {(allMoments.length > 0 || filter !== "all") && (
          <MomentFilterBar
            value={filter}
            onChange={setFilter}
            people={people}
            me={me ? { name: me.name, image: me.image ?? null } : null}
          />
        )}
        <div className="min-h-0 flex-1">
        <MomentFeed
          moments={moments}
          filtered={filter !== "all"}
          filterKey={filterKey}
          seenUntil={seenAtOpen}
          onViewed={onViewed}
          openId={openId}

          isPending={isPending}
          isError={isError}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          onRetry={() => refetch()}
          onDelete={handleDelete}
          onLeave={handleLeave}
          onToggleReaction={handleToggleReaction}
          onNew={() => setCreateOpen(true)}
        />
        </div>
      </main>


      {/* Hành động nổi — góc phải-dưới, nằm NGAY TRÊN BottomBar ở mobile
          (thanh này fixed, MomentFeed đã chừa chỗ cho nó). */}
      <div className="pointer-events-none absolute right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6">
        <MomentInviteButton floating onFeedChanged={invalidate} />
        <Button
          onClick={() => setCreateOpen(true)}
          size="icon"
          className="pointer-events-auto size-12 rounded-full shadow-lg"
          aria-label={t("moments.newMoment")}
          title={t("moments.newMoment")}
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {notice && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive shadow-lg"
        >
          {notice}
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !working && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.kind === "leave" ? t("moments.leave") : t("moments.delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === "leave" ? t("moments.leaveConfirm") : t("moments.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>{t("moments.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={(e) => {
                e.preventDefault();
                void runConfirmed();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {working ? <Loader2 className="size-4 animate-spin" /> : confirming?.kind === "leave" ? t("moments.leave") : t("moments.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateMomentDialog
        open={createOpen || Boolean(editDraft)}
        editMoment={editDraft}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditDraft(null);
          }
        }}
        onCreated={() => {
          invalidate();
          invalidateInvitations();
        }}
      />
    </div>
  );
};