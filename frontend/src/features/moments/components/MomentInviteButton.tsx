import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  ImagePlus,
  Loader2,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MediaPicker } from "@/features/gallery/components/MediaPicker";
import {
  deleteMoment,
  fetchMomentInvitations,
  fillMomentSlots,
  momentInvitationsQueryKey,
} from "@/services/moments";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "@/hooks/useSignaling";
import { useMomentInviteStore } from "@/hooks/useMomentInviteStore";
import { useMomentEditStore } from "@/hooks/useMomentEditStore";
import { Moment } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  onFeedChanged: () => void;
};

/**
 * Chuông lời mời moment collab (draft chưa đủ ảnh, hiệu lực 24h).
 * - Realtime qua WS: `moment:collab-invite` (có lời mời mới)
 *   và `moment:collab-complete` (moment đã đủ slot → refresh feed).
 * - Bấm lời mời có slot của mình → dialog chọn 1+ ảnh → fillMomentSlots
 */
export const MomentInviteButton: React.FC<Props> = ({ onFeedChanged }) => {
  const { t } = useTranslation();
  const signaling = useSignaling();
  const queryClient = useQueryClient();

  const [fillTarget, setFillTarget] = useState<Moment | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const unreadRef = useRef(0);

  const {
    data: invitations,
    isPending,
    refetch,
  } = useQuery({
    queryKey: momentInvitationsQueryKey,
    queryFn: fetchMomentInvitations,
    staleTime: 15_000,
  });

  const items = invitations ?? [];

  useEffect(() => {
    const offs = [
      signaling.on(SIGNAL.MOMENT_COLLAB_INVITE, (payload) => {
        const p = payload as { momentId?: string };
        if (!p.momentId) return;
        unreadRef.current += 1;
        void refetch();
      }),
      signaling.on(SIGNAL.MOMENT_COLLAB_COMPLETE, () => {
        onFeedChanged();
        void refetch();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling, refetch, onFeedChanged]);

  const openFill = useCallback((moment: Moment) => {
    setFillTarget(moment);
    setPickedIds([]);
    setFillError(null);
  }, []);

  const setEditDraft = useMomentEditStore((s) => s.setEditDraft);

  // "Undo" draft của mình — xoá trước khi bạn kịp điền ảnh.
  const handleCancelDraft = async (moment: Moment) => {
    if (!window.confirm(t("moments.deleteConfirm"))) return;
    try {
      await deleteMoment(moment.id);
      onFeedChanged();
      void refetch();
    } catch {
      window.alert(t("moments.deleteFailed"));
    }
  };

  // Mở sẵn dialog điền ảnh khi user đến từ toast lời mời app-wide.
  const pendingFillId = useMomentInviteStore((s) => s.pendingFillId);
  const setPendingFillId = useMomentInviteStore((s) => s.setPendingFillId);

  useEffect(() => {
    if (!pendingFillId) return;
    const target = (invitations ?? []).find((m) => m.id === pendingFillId);
    if (target && (target.myPendingSlots?.length ?? 0) > 0) {
      openFill(target);
    }
    setPendingFillId(null);
  }, [pendingFillId, invitations, openFill, setPendingFillId]);

  const submitFill = async () => {
    const pendingCount = fillTarget?.myPendingSlots?.length ?? 0;
    if (!fillTarget || pendingCount === 0) return;
    if (pickedIds.length === 0 || posting) return;
    setPosting(true);
    setFillError(null);
    try {
      const result = await fillMomentSlots(fillTarget.id, pickedIds);
      if (result.complete) onFeedChanged();
      setFillTarget(null);
      setPickedIds([]);
      void refetch();
    } catch (err) {
      setFillError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  const showBadge = items.length > 0;

  const pendingPickCount = fillTarget?.myPendingSlots?.length ?? 1;

  const togglePick = (id: string) => {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= pendingPickCount) return prev;
      return [...prev, id];
    });
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            unreadRef.current = 0;
            void queryClient.invalidateQueries({
              queryKey: momentInvitationsQueryKey,
            });
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="relative shrink-0"
            aria-label={t("moments.invitations")}
            title={t("moments.invitations")}
          >
            <BellRing className="size-4" />
            {showBadge && (
              <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[9px]">
                {unreadRef.current || items.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Users className="size-3.5 text-primary" />
            {t("moments.invitations")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isPending ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full rounded-md bg-muted/40" />
              <Skeleton className="h-10 w-full rounded-md bg-muted/40" />
            </div>
          ) : items.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="cursor-default text-muted-foreground"
            >
              {t("moments.noInvitations")}
            </DropdownMenuItem>
          ) : (
            items.map((moment) => {
              const myPendingCount = moment.myPendingSlots?.length ?? 0;
              const fillable = myPendingCount > 0;
              const filled = moment.slots.filter((s) => s.filled);
              const filledCount = filled.length;
              const cover = filled[0]?.thumbnailUrl;
              const ownDraft = moment.isOwn && !fillable;
              return (
                <DropdownMenuItem
                  key={moment.id}
                  className="flex flex-col items-stretch gap-1.5 py-2.5"
                  onSelect={(e) => {
                    e.preventDefault();
                    if (fillable) openFill(moment);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-[9px] text-muted-foreground">
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Users className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {moment.userName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {fillable
                          ? myPendingCount > 1
                            ? t("moments.yourSlotsPending", {
                                n: myPendingCount,
                              })
                            : t("moments.yourSlotPending")
                          : t("moments.waitingForFriends", {
                              n: new Set(
                                moment.slots
                                  .filter((s) => !s.filled)
                                  .map((s) => s.userId),
                              ).size,
                            })}{" "}
                        · {filledCount}/{moment.slots.length}
                      </p>
                    </div>
                    {fillable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1 px-2 py-1 text-[11px]"
                      >
                        <ImagePlus className="size-3.5" />
                        {t("moments.fillSlot")}
                      </Button>
                    )}
                  </div>
                  {ownDraft && (
                    <div className="flex gap-1.5 pl-11.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => setEditDraft(moment)}
                      >
                        <Pencil className="size-3" />
                        {t("moments.editDraft")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-[11px] text-destructive"
                        onClick={() => {
                          void handleCancelDraft(moment);
                        }}
                      >
                        <Trash2 className="size-3" />
                        {t("moments.cancelDraft")}
                      </Button>
                    </div>
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog điền ảnh vào slot của mình */}
      <Dialog
        open={Boolean(fillTarget)}
        onOpenChange={(open) => {
          if (!open) setFillTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-slot="moment-fill-dialog">
          <DialogHeader>
            <DialogTitle>
              {t("moments.fillSlotTitle", {
                n: pendingPickCount,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("moments.fillSlotDesc", {
                user: fillTarget?.userName ?? "",
                n: pendingPickCount,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {fillError && (
              <p className="text-xs text-destructive">{fillError}</p>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("moments.selectPhoto")}
              </span>
              <span
                className={cn(
                  "font-medium",
                  pickedIds.length < pendingPickCount
                    ? "text-muted-foreground"
                    : "text-primary",
                )}
              >
                {pickedIds.length}/{pendingPickCount}
              </span>
            </div>

            <MediaPicker
              selectedIds={new Set(pickedIds)}
              onToggle={(item) => togglePick(item.id)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setFillTarget(null)}
              disabled={posting}
            >
              {t("moments.cancel")}
            </Button>
            <Button
              onClick={submitFill}
              disabled={pickedIds.length === 0 || posting}
            >
              {posting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("moments.confirmFill")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
