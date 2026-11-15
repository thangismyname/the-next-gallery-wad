// /friends — Bạn bè. Cùng bố cục với màn Friends của mobile (đẹp hơn, đồng nhất):
// 1 cột giữa trang, 3 tab Bạn bè · Lời mời · Thêm bạn ở mọi kích thước, danh
// sách dạng nhóm có đường kẻ giữa các hàng; vẫn giữ style web (màu, Button
// shadcn). Tab + từ khoá nằm trên URL (`?tab=requests`, `?q=` từ Spotlight).
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, X } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { usePresence } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";
import type { Friend } from "@tng/shared";
import { useFriends } from "./useFriends";
import { AddFriendPanel } from "./components/AddFriendPanel";
import { FriendInviteCard } from "./components/FriendInviteCard";
import { FriendList } from "./components/FriendList";
import { RequestList } from "./components/RequestList";

type Tab = "friends" | "requests" | "add";

const CountBadge: React.FC<{ n: number; accent?: boolean }> = ({ n, accent }) =>
  n > 0 ? (
    <span
      className={cn(
        "rounded-full px-1.5 text-[10px] font-medium tabular-nums",
        accent ? "bg-primary text-primary-foreground" : "bg-muted",
      )}
    >
      {n}
    </span>
  ) : null;

export const FriendsView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const online = usePresence((s) => s.online);
  const f = useFriends();
  const [toDelete, setToDelete] = useState<Friend | null>(null);
  const [query, setQuery] = useState(() => params.get("q") ?? "");

  // Có từ khoá từ Spotlight → mở thẳng tab Thêm bạn.
  const tab: Tab = (params.get("tab") as Tab | null) ?? (params.get("q") ? "add" : "friends");
  const setTab = (next: string) =>
    setParams(
      (p) => {
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  const send = (id: string) => navigate(`/share?to=${encodeURIComponent(id)}`);
  const onlineCount = f.friends.filter((x) => online[x.id]).length;

  const addPanel = (
    <AddFriendPanel
      query={query}
      onQueryChange={setQuery}
      busy={f.busy}
      onAdd={f.add}
      onAccept={f.accept}
      onCancel={f.cancel}
      onSend={send}
      autoFocus={tab === "add"}
    />
  );

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("friends.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("friends.summary", { count: f.friends.length, online: onlineCount })}
          </p>
        </div>
      </header>

      {f.notice && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            f.notice.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          <span className="flex-1">{f.notice.text}</span>
          <button type="button" onClick={f.clearNotice} aria-label={t("common.cancel")}>
            <X className="size-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}

      <div>
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends" className="gap-1.5">
              {t("friends.friendsTab")}
              <CountBadge n={f.friends.length} />
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              {t("friends.requestsTab")}
              <CountBadge n={f.requests.length} accent />
            </TabsTrigger>
            <TabsTrigger value="add">
              {t("friends.addTab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-4">
            <FriendList
              friends={f.friends}
              pending={f.listState.pending}
              error={f.listState.error}
              onRetry={f.listState.retry}
              busy={f.busy}
              onSend={send}
              onUnfriend={setToDelete}
              onAddFriend={() => setTab("add")}
            />
          </TabsContent>
          <TabsContent value="requests" className="mt-4">
            <RequestList
              incoming={f.requests}
              sent={f.sentRequests}
              pending={f.requestsState.pending}
              error={f.requestsState.error}
              onRetry={f.requestsState.retry}
              busy={f.busy}
              onAccept={f.accept}
              onDecline={f.decline}
              onCancel={f.cancel}
            />
          </TabsContent>
          <TabsContent value="add" className="mt-4 space-y-5">
            {addPanel}
            <FriendInviteCard />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("friends.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("friends.deleteDesc", { name: toDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("friends.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const target = toDelete;
                setToDelete(null);
                if (target) void f.unfriend(target);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {toDelete && f.busy[toDelete.id] ? <Loader2 className="size-4 animate-spin" /> : t("friends.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
