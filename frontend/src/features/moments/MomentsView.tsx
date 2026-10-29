import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchMoments,
  deleteMoment,
  leaveMoment,
  reactToMoment,
  removeMomentReaction,
  momentMemesQueryKey,
  momentsFeedQueryKey,
  momentInvitationsQueryKey,
} from "@/services/moments";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";
import { Moment } from "@/types";
import { MomentFeed } from "./components/MomentFeed";
import { CreateMomentDialog } from "./components/CreateMomentDialog";
import { MomentInviteButton } from "./components/MomentInviteButton";
import { useMomentEditStore } from "@/hooks/useMomentEditStore";
import { BottomBarNav } from "@/features/navigation/components/BottomBarNav";

export const MomentsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const editDraft = useMomentEditStore((s) => s.editDraft);
  const setEditDraft = useMomentEditStore((s) => s.setEditDraft);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: momentsFeedQueryKey,
    queryFn: () => fetchMoments(),
    staleTime: 30_000,
  });

  const moments = useMemo(() => data?.items ?? [], [data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey });
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: momentInvitationsQueryKey });

  // Realtime meme: người khác thả/xóa/tim meme trên moment → cập nhật list
  // meme panel (+ memeCount ở feed khi thêm/xóa) mà không cần vuốt để refetch.
  const signaling = useSignaling();
  useEffect(() => {
    const onMemeEvent = (refreshFeed: boolean) => (payload: unknown) => {
      const p = payload as { momentId?: string };
      if (!p.momentId) return;
      void queryClient.invalidateQueries({
        queryKey: momentMemesQueryKey(p.momentId),
      });
      if (refreshFeed) {
        void queryClient.invalidateQueries({ queryKey: momentsFeedQueryKey });
      }
    };
    const offs = [
      signaling.on(SIGNAL.MOMENT_MEME_ADDED, onMemeEvent(true)),
      signaling.on(SIGNAL.MOMENT_MEME_REMOVED, onMemeEvent(true)),
      signaling.on(SIGNAL.MOMENT_MEME_REACTED, onMemeEvent(false)),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling, queryClient]);

  const handleDelete = async (moment: Moment) => {
    if (!window.confirm(t("moments.deleteConfirm"))) return;
    try {
      await deleteMoment(moment.id);
      invalidate();
    } catch {
      window.alert(t("moments.deleteFailed"));
    }
  };

  // Người được mời gỡ ảnh của mình khỏi moment collab
  const handleLeave = async (moment: Moment) => {
    if (!window.confirm(t("moments.leaveConfirm"))) return;
    try {
      await leaveMoment(moment.id);
      invalidate();
      invalidateInvitations();
    } catch (error) {
      window.alert(
        error instanceof Error && error.message
          ? error.message
          : t("moments.leaveFailed"),
      );
    }
  };

  const handleToggleReaction = async (moment: Moment, emoji: string) => {
    try {
      if (moment.myReaction === emoji) {
        await removeMomentReaction(moment.id);
      } else {
        await reactToMoment(moment.id, { emoji });
      }
      invalidate();
    } catch {
      // silent — reaction optimistic-ish UI, invalidate sẽ sửa lại đúng state
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="z-40 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/gallery")
          }
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={t("moments.back")}
          title={t("moments.back")}
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-w-0 text-center">
          <h1 className="truncate text-base font-semibold leading-tight">
            {t("moments.title")}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {t("moments.subtitle")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <MomentInviteButton onFeedChanged={invalidate} />
          <Button
            onClick={() => setCreateOpen(true)}
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
          >
            <Plus className="size-4" />
            {t("moments.newMoment")}
          </Button>
        </div>
      </header>

      {/* Feed vuốt — full height, mỗi vuốt chuyển đúng 1 tấm */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <MomentFeed
          moments={moments}
          isPending={isPending}
          isError={isError}
          onRetry={() => refetch()}
          onDelete={handleDelete}
          onLeave={handleLeave}
          onToggleReaction={handleToggleReaction}
          onNew={() => setCreateOpen(true)}
        />
      </main>

      {/* Điều hướng — trang này toàn màn hình (ngoài MainLayout, không có
          sidebar) nên hiện ở mọi cỡ màn; là footer riêng nên không đè feed. */}
      <nav
        aria-label={t("navigation.bottomBar.ariaLabel")}
        className="flex shrink-0 justify-center px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <BottomBarNav />
      </nav>

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