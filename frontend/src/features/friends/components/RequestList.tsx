// Lời mời: đã nhận (chấp nhận / từ chối) + đã gửi (huỷ).
import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Inbox, Loader2, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@tng/shared";
import type { FriendRequest } from "@tng/shared";
import { PersonAvatar } from "./PersonAvatar";

interface RequestListProps {
  incoming: FriendRequest[];
  sent: FriendRequest[];
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  busy: Record<string, string>;
  onAccept: (r: FriendRequest) => void;
  onDecline: (r: FriendRequest) => void;
  onCancel: (r: FriendRequest) => void;
}

const Spin: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) =>
  on ? <Loader2 className="size-3.5 animate-spin" /> : <>{children}</>;

const Row: React.FC<{ request: FriendRequest; children: React.ReactNode }> = ({ request, children }) => {
  const { i18n } = useTranslation();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <PersonAvatar name={request.name} src={request.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{request.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {request.email}
          {request.requestedAt && ` · ${formatRelative(request.requestedAt, i18n.language)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </li>
  );
};

export const RequestList: React.FC<RequestListProps> = ({
  incoming,
  sent,
  pending,
  error,
  onRetry,
  busy,
  onAccept,
  onDecline,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (pending) {
    return (
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: 3 }).map((_, i) => (
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
        {t("friends.requestsLoadFailed")}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("friends.retry")}
        </Button>
      </div>
    );
  }
  if (incoming.length === 0 && sent.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <Inbox className="size-10 animate-float text-muted-foreground/40" />
        <p className="text-sm">{t("friends.requestsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {incoming.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("friends.incoming", { count: incoming.length })}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {incoming.map((r) => (
              <Row key={r.id} request={r}>
                <Button size="sm" className="gap-1.5" disabled={Boolean(busy[r.id])} onClick={() => onAccept(r)}>
                  <Spin on={busy[r.id] === "accept"}>
                    <Check className="size-3.5" />
                  </Spin>
                  {t("friends.accept")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={Boolean(busy[r.id])}
                  onClick={() => onDecline(r)}
                  aria-label={t("friends.decline")}
                >
                  <Spin on={busy[r.id] === "decline"}>
                    <X className="size-3.5" />
                  </Spin>
                  <span className="hidden sm:inline">{t("friends.decline")}</span>
                </Button>
              </Row>
            ))}
          </ul>
        </section>
      )}
      {sent.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("friends.outgoing", { count: sent.length })}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {sent.map((r) => (
              <Row key={r.id} request={r}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  disabled={Boolean(busy[r.id])}
                  onClick={() => onCancel(r)}
                >
                  <Spin on={busy[r.id] === "cancel"}>
                    <Undo2 className="size-3.5" />
                  </Spin>
                  {t("friends.cancelRequest")}
                </Button>
              </Row>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
