// Danh sách bạn bè: lọc tại chỗ (tên / email, không dấu), sắp xếp (online
// trước · A→Z · mới kết bạn), hàng "Đang online" để gửi nhanh. Mỗi hàng memo —
// presence đổi chỉ vẽ lại hàng của người đó.
import React, { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, MoreHorizontal, Search, Send, UserX, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePresence } from "@/hooks/usePresence";
import { normalize } from "@/features/search/searchScope";
import { cn } from "@/lib/utils";
import { formatDate } from "@tng/shared";
import type { Friend } from "@tng/shared";
import { PersonAvatar } from "./PersonAvatar";

type Sort = "online" | "name" | "recent";
const SORTS: Sort[] = ["online", "name", "recent"];

interface FriendRowProps {
  friend: Friend;
  online: boolean;
  busy: boolean;
  onSend: (id: string) => void;
  onUnfriend: (friend: Friend) => void;
}

const FriendRow = memo(function FriendRow({ friend, online, busy, onSend, onUnfriend }: FriendRowProps) {
  const { t, i18n } = useTranslation();
  return (
    <li className="flex items-center gap-3 px-4 py-3 [content-visibility:auto] [contain-intrinsic-size:auto_68px]">
      <PersonAvatar name={friend.name} src={friend.avatarUrl} online={online} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{friend.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {online ? (
            <span className="text-emerald-600 dark:text-emerald-400">{t("transfer.online")}</span>
          ) : (
            friend.email
          )}
          {friend.friendSince && (
            <span className="hidden md:inline">
              {" · "}
              {t("friends.since", { date: formatDate(friend.friendSince, i18n.language) })}
            </span>
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => onSend(friend.id)}
        aria-label={t("friends.sendMedia")}
      >
        <Send className="size-3.5" />
        <span className="hidden sm:inline">{t("friends.sendMedia")}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("friends.more")} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onSend(friend.id)}>
            <Send />
            {t("friends.sendMedia")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(friend.email)}>
            <Copy />
            {t("friends.copyEmail")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onUnfriend(friend)}>
            <UserX />
            {t("friends.unfriend")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
});

interface FriendListProps {
  friends: Friend[];
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  busy: Record<string, string>;
  onSend: (id: string) => void;
  onUnfriend: (friend: Friend) => void;
  onAddFriend: () => void;
}

export const FriendList: React.FC<FriendListProps> = ({
  friends,
  pending,
  error,
  onRetry,
  busy,
  onSend,
  onUnfriend,
  onAddFriend,
}) => {
  const { t } = useTranslation();
  const online = usePresence((s) => s.online);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("online");

  const onlineFriends = useMemo(() => friends.filter((f) => online[f.id]), [friends, online]);
  const visible = useMemo(() => {
    const q = normalize(filter);
    const list = q
      ? friends.filter((f) => normalize(f.name).includes(q) || f.email.toLowerCase().includes(q))
      : [...friends];
    if (sort === "online") {
      list.sort((a, b) => Number(Boolean(online[b.id])) - Number(Boolean(online[a.id])) || a.name.localeCompare(b.name));
    } else if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => (b.friendSince ?? "").localeCompare(a.friendSince ?? ""));
    }
    return list;
  }, [friends, filter, sort, online]);

  if (pending) {
    return (
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
        {t("friends.loadFailed")}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("friends.retry")}
        </Button>
      </div>
    );
  }
  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <Users className="size-10 animate-float text-muted-foreground/40" />
        <p className="text-sm">{t("friends.empty")}</p>
        <Button size="sm" onClick={onAddFriend}>
          {t("friends.addFirst")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onlineFriends.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("friends.onlineNow", { count: onlineFriends.length })}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {onlineFriends.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSend(f.id)}
                title={t("friends.sendTo", { name: f.name })}
                className="group flex w-14 shrink-0 flex-col items-center gap-1"
              >
                <PersonAvatar name={f.name} src={f.avatarUrl} online size="lg" className="transition-transform group-hover:scale-105" />
                <span className="w-full truncate text-center text-[11px] text-muted-foreground group-hover:text-foreground">
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("friends.filterPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
        <div className="flex gap-1">
          {SORTS.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={sort === s ? "secondary" : "ghost"}
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={cn(sort !== s && "text-muted-foreground")}
            >
              {t(`friends.sort.${s}`)}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("friends.noMatch")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((friend) => (
            <FriendRow
              key={friend.id}
              friend={friend}
              online={Boolean(online[friend.id])}
              busy={Boolean(busy[friend.id])}
              onSend={onSend}
              onUnfriend={onUnfriend}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
