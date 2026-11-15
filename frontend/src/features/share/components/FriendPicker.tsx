// Chọn bạn bè nhận file (nhiều người) — chấm xanh = đang online (nhận P2P ngay).
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFriends } from "@/services/friends";
import { usePresence } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";
import { getInitials } from "@tng/shared";

interface FriendPickerProps {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  className?: string;
}

export const FriendPicker: React.FC<FriendPickerProps> = ({ selected, onToggle, className }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const online = usePresence((s) => s.online);
  const { data: friends = [], isPending } = useQuery({
    queryKey: ["friends", "list"],
    queryFn: fetchFriends,
    staleTime: 60_000,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? friends.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q))
      : friends;
    // Đang online lên đầu.
    return [...list].sort((a, b) => Number(Boolean(online[b.id])) - Number(Boolean(online[a.id])));
  }, [friends, query, online]);

  if (isPending) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-2 py-8 text-center", className)}>
        <Users className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("transfer.noFriends")}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("transfer.searchFriends")}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {visible.map((friend) => {
          const isSelected = selected.has(friend.id);
          const isOnline = Boolean(online[friend.id]);
          return (
            <li key={friend.id}>
              <button
                type="button"
                onClick={() => onToggle(friend.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors",
                  isSelected ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/50",
                )}
              >
                <span className="relative">
                  <Avatar size="sm">
                    {friend.avatarUrl ? <AvatarImage src={friend.avatarUrl} alt={friend.name} /> : null}
                    <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                  </Avatar>
                  {isOnline && (
                    <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{friend.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {isOnline ? t("transfer.online") : t("transfer.offlineRelay")}
                  </span>
                </span>
                {isSelected && <Check className="size-4 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
