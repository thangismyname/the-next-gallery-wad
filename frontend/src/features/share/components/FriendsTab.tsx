import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, CheckSquare2 } from "lucide";
import { Check, Loader2, Search, Users } from "lucide-react";
import { MorphIcon } from "morphicons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchShareFriends,
  shareToFriends,
  ShareHttpError,
  type ShareFriend,
} from "@/services/share";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/features/gallery/components/MediaPicker";

type Friend = ShareFriend;

interface FriendsTabProps {
  mediaIds: string[];
  initialFriendId?: string | null;
}

export const FriendsTab: React.FC<FriendsTabProps> = ({
  mediaIds,
  initialFriendId,
}) => {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    initialFriendId ? { [initialFriendId]: true } : {},
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media picker
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    mediaIds.forEach((id) => {
      init[id] = true;
    });
    return init;
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchShareFriends();
        if (mounted) setFriends(data);
      } catch {
        if (mounted) setFriends([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMedia = (id: string) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedIds = Object.entries(selected)
    .filter(([, value]) => value)
    .map(([id]) => id);

  const pickedSet = useMemo(
    () => new Set(Object.keys(picked).filter((id) => picked[id])),
    [picked],
  );
  const pickedIds = [...pickedSet];

  const canSend = pickedIds.length > 0 && selectedIds.length > 0 && !sending;

  const filteredFriends = friends.filter((f) => {
    const query = friendSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      f.name.toLowerCase().includes(query) ||
      f.email.toLowerCase().includes(query)
    );
  });

  const sendToFriends = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await shareToFriends(pickedIds, selectedIds);
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } catch (err) {
      // Lỗi từ server → hiện message của backend; lỗi mạng → câu chung.
      setError(err instanceof ShareHttpError ? err.message : t("share.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border border-border/40 p-2"
          >
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Media picker */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("share.pickMedia")}
          </p>
        </div>
        <MediaPicker
          selectedIds={pickedSet}
          onToggle={(item) => toggleMedia(item.id)}
          gridClassName="max-h-44"
        />
      </div>

      <Separator />

      {/* Friend list */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("share.pickFriends")}
          </p>
          <div className="relative flex-1 max-w-[180px]">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder={t("share.searchFriends")}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {friends.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("share.noFriends")}</p>
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Search className="size-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {t("share.noFriendResults")}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-44 pr-1">
            <ul className="flex flex-col gap-2">
              {filteredFriends.map((friend) => {
                const isSelected = Boolean(selected[friend.id]);
                return (
                  <li key={friend.id}>
                    <button
                      type="button"
                      onClick={() => toggle(friend.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors",
                        isSelected
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/40 hover:bg-muted/50",
                      )}
                    >
                      <Avatar size="sm">
                        {friend.avatar_url ? (
                          <AvatarImage
                            src={friend.avatar_url}
                            alt={friend.name}
                          />
                        ) : null}
                        <AvatarFallback>
                          {friend.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {friend.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {friend.email}
                        </p>
                      </div>
                      {isSelected && <Check className="size-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <Button
        size="sm"
        className="w-full"
        disabled={!canSend}
        onClick={sendToFriends}
      >
        {sending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MorphIcon icon={sent ? CheckSquare2 : Send} size={14} />
        )}
        {sent
          ? t("share.invitesSent")
          : t("share.sendToFriends", { count: selectedIds.length })}
      </Button>
    </div>
  );
};
