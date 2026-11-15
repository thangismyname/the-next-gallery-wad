// Thêm bạn: gõ là tìm (email đầy đủ hoặc tên ≥ 2 ký tự), mỗi kết quả có đúng
// nút theo quan hệ: Kết bạn · Chấp nhận (họ đã mời mình) · Huỷ lời mời · Gửi file.
import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Search, Send, Undo2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FriendRequest, type FriendSearchResult } from "@tng/shared";
import { useFriendSearch } from "../useFriends";
import { PersonAvatar } from "./PersonAvatar";

interface AddFriendPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  busy: Record<string, string>;
  onAdd: (userId: string) => void;
  onAccept: (r: FriendRequest) => void;
  onCancel: (r: FriendRequest) => void;
  onSend: (userId: string) => void;
  autoFocus?: boolean;
}

const asRequest = (r: FriendSearchResult): FriendRequest => ({
  id: r.requestId ?? "",
  userId: r.id,
  name: r.name,
  email: r.email,
  avatarUrl: r.avatarUrl,
});

export const AddFriendPanel: React.FC<AddFriendPanelProps> = ({
  query,
  onQueryChange,
  busy,
  onAdd,
  onAccept,
  onCancel,
  onSend,
  autoFocus,
}) => {
  const { t } = useTranslation();
  const { results, searching, error, tooShort, debouncedQuery } = useFriendSearch(query);

  const action = (r: FriendSearchResult) => {
    const isBusy = Boolean(busy[r.id] || (r.requestId && busy[r.requestId]));
    const spin = <Loader2 className="size-3.5 animate-spin" />;
    switch (r.relationship) {
      case "friends":
        return (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSend(r.id)}>
            <Send className="size-3.5" />
            <span className="hidden sm:inline">{t("friends.sendMedia")}</span>
          </Button>
        );
      case "pending_inbound":
        return (
          <Button size="sm" className="gap-1.5" disabled={isBusy} onClick={() => onAccept(asRequest(r))}>
            {isBusy ? spin : <Check className="size-3.5" />}
            {t("friends.accept")}
          </Button>
        );
      case "pending_outbound":
        return (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={isBusy}
            onClick={() => onCancel(asRequest(r))}
          >
            {isBusy ? spin : <Undo2 className="size-3.5" />}
            {t("friends.cancelRequest")}
          </Button>
        );
      default:
        return (
          <Button size="sm" className="gap-1.5" disabled={isBusy} onClick={() => onAdd(r.id)}>
            {isBusy ? spin : <UserPlus className="size-3.5" />}
            {t("friends.sendRequest")}
          </Button>
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("friends.addPlaceholder")}
          aria-label={t("friends.addPlaceholder")}
          className="h-11 pr-9 pl-9 text-base md:text-sm"
          autoFocus={autoFocus}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {tooShort ? (
        <p className="text-xs text-muted-foreground">{t("friends.searchHint")}</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : debouncedQuery && !searching && results.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("friends.notFound")}</p>
      ) : results.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <PersonAvatar name={r.name} src={r.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.relationship === "none" ? r.email : t(`friends.relation.${r.relationship}`)}
                </p>
              </div>
              {action(r)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("friends.addHint")}</p>
      )}
    </div>
  );
};
