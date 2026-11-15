// Lịch sử gửi / hộp nhận (bạn bè gửi thẳng). Ảnh bìa đã mã hoá → giải mã tại
// máy bằng khoá phiên (đã lưu khi gửi / bọc cho thiết bị này khi nhận).
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileImage, Inbox, Link2, Send } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { InboxTransfer, SentTransfer } from "@/services/transfers";
import { formatBytes, formatRelative } from "@tng/shared";
import { cn } from "@/lib/utils";
import { decryptThumbUrl, recallTransferKey } from "../engine/crypto";
import { unwrapForThisDevice } from "../engine/deviceKeys";
import type { WrappedKey } from "../engine/protocol";
import { ViaBadge } from "./ViaBadge";

function useCover(id: string, thumb: string | null, wrappedKeys?: WrappedKey[]) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!thumb) return;
    let alive = true;
    let created: string | null = null;
    void (async () => {
      const key =
        (await recallTransferKey(id)) ?? (wrappedKeys?.length ? await unwrapForThisDevice(wrappedKeys) : null);
      if (!key || !alive) return;
      created = await decryptThumbUrl(key, 0, thumb);
      if (alive) setUrl(created);
      else if (created) URL.revokeObjectURL(created);
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, thumb, wrappedKeys]);
  return url;
}

const Cover: React.FC<{ id: string; thumb: string | null; wrappedKeys?: WrappedKey[] }> = (props) => {
  const url = useCover(props.id, props.thumb, props.wrappedKeys);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <FileImage className="size-5 text-muted-foreground" />}
    </span>
  );
};

const Row: React.FC<{ onClick: () => void; children: React.ReactNode; dim?: boolean }> = ({ onClick, children, dim }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50",
        dim && "opacity-60",
      )}
    >
      {children}
    </button>
  </li>
);

export const SentList: React.FC<{
  items: SentTransfer[] | undefined;
  onOpen: (id: string) => void;
}> = ({ items, onOpen }) => {
  const { t, i18n } = useTranslation();
  if (!items) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <Send className="size-8 opacity-40" />
        {t("transfer.sentEmpty")}
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((s) => (
        <Row key={s.id} onClick={() => onOpen(s.id)} dim={!s.open}>
          <Cover id={s.id} thumb={s.coverThumb} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {s.kind === "link" ? <Link2 className="size-3.5" /> : <Send className="size-3.5" />}
              {t("transfer.filesCount", { count: s.fileCount })} · {formatBytes(s.totalBytes)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {formatRelative(s.createdAt, i18n.language)} ·{" "}
              {s.open
                ? t("transfer.receivedBy", { done: s.doneCount, total: s.recipientCount })
                : t("transfer.closed")}
            </span>
          </span>
        </Row>
      ))}
    </ul>
  );
};

export const InboxList: React.FC<{
  items: InboxTransfer[] | undefined;
  onOpen: (id: string) => void;
}> = ({ items, onOpen }) => {
  const { t, i18n } = useTranslation();
  if (!items) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <Inbox className="size-8 opacity-40" />
        {t("transfer.inboxEmpty")}
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((r) => {
        const libraryOnly = r.libraryCount === r.fileCount;
        return (
          <Row key={r.id} onClick={() => onOpen(r.id)} dim={!r.open && !libraryOnly}>
            <Cover id={r.id} thumb={r.coverThumb} wrappedKeys={r.wrappedKeys} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {t("transfer.fromSender", { name: r.sender.name, count: r.fileCount })}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {formatRelative(r.createdAt, i18n.language)} · {t(`transfer.status.${r.status}`)}
                <ViaBadge via={r.via} />
              </span>
            </span>
          </Row>
        );
      })}
    </ul>
  );
};
