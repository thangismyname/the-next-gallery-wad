// Realtime bạn bè toàn app (MainLayout): WS friend:request / friend:accepted /
// friend:changed → làm mới danh sách (+ badge sidebar) và hiện toast — chấp
// nhận lời mời ngay trong toast.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, UserPlus, Users, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSignaling } from "@/hooks/useSignaling";
import { acceptFriendRequest } from "@/services/friends";
import { SIGNAL } from "@/services/signaling";
import { friendsKeys } from "../useFriends";

type Event =
  | { kind: "request"; key: string; requestId: string; name: string }
  | { kind: "accepted"; key: string; name: string };

const TTL_MS = 15_000;

export const FriendEventsToast: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signaling = useSignaling();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: friendsKeys.all });
    const push = (e: Event) => setEvents((prev) => [...prev.filter((x) => x.key !== e.key), e].slice(-3));
    const offs = [
      signaling.on(SIGNAL.FRIEND_REQUEST, (p) => {
        refresh();
        const from = p.from as { name?: string } | undefined;
        const requestId = p.requestId as string | undefined;
        if (requestId) push({ kind: "request", key: `r:${requestId}`, requestId, name: from?.name ?? "" });
      }),
      signaling.on(SIGNAL.FRIEND_ACCEPTED, (p) => {
        refresh();
        const friend = p.friend as { id?: string; name?: string } | undefined;
        if (friend?.id) push({ kind: "accepted", key: `a:${friend.id}`, name: friend.name ?? "" });
      }),
      signaling.on(SIGNAL.FRIEND_CHANGED, refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling, queryClient]);

  useEffect(() => {
    if (!events.length) return;
    const timer = setTimeout(() => setEvents((prev) => prev.slice(1)), TTL_MS);
    return () => clearTimeout(timer);
  }, [events]);

  if (!events.length) return null;
  const dismiss = (key: string) => setEvents((prev) => prev.filter((e) => e.key !== key));

  const accept = async (e: Extract<Event, { kind: "request" }>) => {
    setBusy(e.key);
    try {
      await acceptFriendRequest(e.requestId);
      await queryClient.invalidateQueries({ queryKey: friendsKeys.all });
      dismiss(e.key);
    } catch {
      navigate("/friends?tab=requests");
      dismiss(e.key);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-2 sm:bottom-4">
      {events.map((e) => (
        <Alert key={e.key} className="w-80 shadow-lg">
          {e.kind === "request" ? <UserPlus className="size-4" /> : <Users className="size-4" />}
          <AlertTitle className="flex items-center justify-between gap-2">
            {e.kind === "request" ? t("friends.toastRequestTitle") : t("friends.toastAcceptedTitle")}
            <button
              type="button"
              onClick={() => dismiss(e.key)}
              aria-label={t("common.cancel")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {e.kind === "request"
                ? t("friends.toastRequestBody", { name: e.name })
                : t("friends.toastAcceptedBody", { name: e.name })}
            </p>
            {e.kind === "request" ? (
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5" disabled={busy === e.key} onClick={() => void accept(e)}>
                  {busy === e.key ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {t("friends.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    dismiss(e.key);
                    navigate("/friends?tab=requests");
                  }}
                >
                  {t("friends.viewRequests")}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss(e.key);
                  navigate("/friends");
                }}
              >
                {t("friends.goToFriends")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
