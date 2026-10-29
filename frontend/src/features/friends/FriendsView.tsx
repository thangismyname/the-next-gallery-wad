import React from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Loader2,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useFriends } from "./useFriends";
import { FriendInviteCard } from "./components/FriendInviteCard";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { useShareContext } from "@/features/share/ShareProvider";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";

export const FriendsView: React.FC = () => {
  const { t } = useTranslation();
  const openShare = useGalleryActionsStore((s) => s.openShare);
  const { isFriendOnline } = useShareContext();

  const handleSendToFriend = (friendId: string) => {
    openShare([], { friendId });
  };

  // Bạn bè + lời mời + tìm / thêm / xoá (useFriends.ts).
  const {
    friends,
    requests,
    isPending,
    isError,
    refetch,
    requestsPending,
    requestsError,
    refetchRequests,
    query,
    setQuery,
    searching,
    searchResult,
    adding,
    addMessage,
    addError,
    handleSearch,
    confirmSend,
    busy,
    handleRespond,
    toDelete,
    setToDelete,
    deleting,
    confirmDelete,
  } = useFriends();

  return (
    <>
      {/* Friend avatar slider — replaces section header */}
      <div className="mb-5">
        {isPending ? (
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex w-14 shrink-0 flex-col items-center gap-1.5"
              >
                <Skeleton className="size-10 rounded-full bg-muted/40" />
                <Skeleton className="h-2.5 w-8 rounded-full bg-muted/40" />
              </div>
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground">
              {t("friends.empty")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {t("friends.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
            {friends.map((friend) => {
              const online = isFriendOnline(friend.id);
              return (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => handleSendToFriend(friend.id)}
                  aria-label={t("friends.sendMedia", { name: friend.name })}
                  title={friend.name}
                  className="group flex w-14 shrink-0 flex-col items-center gap-1.5"
                >
                  <div className="relative">
                    <Avatar
                      size="lg"
                      className="transition-shadow group-hover:ring-2 group-hover:ring-primary/40"
                    >
                      {friend.avatarUrl ? (
                        <AvatarImage src={friend.avatarUrl} alt={friend.name} />
                      ) : null}
                      <AvatarFallback>
                        {getInitials(friend.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background",
                        online ? "bg-emerald-500" : "bg-muted-foreground/40",
                      )}
                      title={online ? t("share.online") : t("share.offline")}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                    {friend.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add friend by name or email */}
      <form
        onSubmit={handleSearch}
        className="mb-2 flex flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center"
      >
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("friends.addPlaceholder")}
          className="flex-1"
          aria-label={t("friends.addPlaceholder")}
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {searching ? t("friends.searching") : t("friends.search")}
        </Button>
      </form>

      {/* Search result — confirm before sending request */}
      {searchResult && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
          <Avatar>
            {searchResult.user.avatar_url ? (
              <AvatarImage
                src={searchResult.user.avatar_url}
                alt={searchResult.user.name}
              />
            ) : null}
            <AvatarFallback>
              {searchResult.user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {searchResult.user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {searchResult.user.email}
            </p>
          </div>
          {searchResult.relationship === "self" ? (
            <span className="text-xs text-muted-foreground">
              {t("friends.relationshipSelf")}
            </span>
          ) : searchResult.relationship === "friends" ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <UserCheck className="size-3.5" />
              {t("friends.relationshipFriends")}
            </span>
          ) : searchResult.relationship === "pending_inbound" ? (
            <span className="text-xs text-muted-foreground">
              {t("friends.relationshipInbound")}
            </span>
          ) : searchResult.relationship === "pending_outbound" ? (
            <span className="text-xs text-muted-foreground">
              {t("friends.relationshipOutbound")}
            </span>
          ) : (
            <Button
              size="sm"
              disabled={adding}
              onClick={confirmSend}
              className="shrink-0"
            >
              {adding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserPlus className="size-3.5" />
              )}
              {adding ? t("friends.sending") : t("friends.sendRequest")}
            </Button>
          )}
        </div>
      )}

      {addError && <p className="-mb-2 text-xs text-destructive">{addError}</p>}
      {addMessage && <p className="-mb-2 text-xs text-primary">{addMessage}</p>}

      {/* Invite via QR / link */}
      <div className="mb-6">
        <FriendInviteCard />
      </div>

      <Tabs defaultValue="friends">
        <TabsList>
          <TabsTrigger value="friends" className="gap-2">
            {t("friends.friendsTab")}
            {friends.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">
                {friends.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            {t("friends.requestsTab")}
            {requests.length > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
                {requests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <p className="text-sm">{t("friends.loadFailed")}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("friends.retry")}
              </Button>
            </div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
              <Users className="size-10 animate-float text-muted-foreground/40" />
              <p className="text-sm">{t("friends.empty")}</p>
              <p className="text-xs text-muted-foreground/60">
                {t("friends.emptyHint")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3"
                >
                  <Avatar size="default">
                    {friend.avatarUrl ? (
                      <AvatarImage src={friend.avatarUrl} alt={friend.name} />
                    ) : null}
                    <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {friend.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {friend.email}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border/60 text-foreground"
                    onClick={() => handleSendToFriend(friend.id)}
                    aria-label={t("friends.sendMedia")}
                  >
                    <Send className="size-3.5" />
                    <span className="hidden sm:inline">
                      {t("friends.sendMedia")}
                    </span>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setToDelete(friend)}
                    aria-label={t("friends.deleteConfirm")}
                  >
                    <UserX className="size-3.5" />
                    <span className="hidden sm:inline">
                      {t("friends.unfriend")}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          {requestsPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : requestsError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <p className="text-sm">{t("friends.requestsLoadFailed")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchRequests()}
              >
                {t("friends.retry")}
              </Button>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
              <UserCheck className="size-10 animate-float text-muted-foreground/40" />
              <p className="text-sm">{t("friends.requestsEmpty")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3"
                >
                  <Avatar size="default">
                    {request.avatarUrl ? (
                      <AvatarImage src={request.avatarUrl} alt={request.name} />
                    ) : null}
                    <AvatarFallback>{getInitials(request.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {request.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {request.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={Boolean(busy[request.id])}
                      onClick={() => void handleRespond(request, "accept")}
                    >
                      {busy[request.id] === "accept" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {t("friends.accept")}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={Boolean(busy[request.id])}
                      onClick={() => void handleRespond(request, "decline")}
                    >
                      {busy[request.id] === "decline" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <X className="size-3.5" />
                      )}
                      <span className="hidden sm:inline">
                        {t("friends.decline")}
                      </span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirm dialog */}
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("friends.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("friends.deleteDesc", { name: toDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("friends.deleteCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("friends.deleteConfirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
