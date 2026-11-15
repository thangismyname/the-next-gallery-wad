// Chia sẻ ảnh đang chọn trong thư viện (Gallery / Favorites / Lightbox):
//   - Bạn bè: server copy thẳng vào thư viện của họ (ngay lập tức, kể cả offline).
//   - Link / QR / mã: ai cũng mở được (không cần đăng nhập), tải từ server.
// File trên máy (P2P) gửi ở trang /share.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2, Loader2, Send, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchMediaByIds } from "@/services/media";
import { TransferHttpError, transfersQueryKey } from "@/services/transfers";
import { FriendPicker } from "./components/FriendPicker";
import { HostPanel } from "./components/HostPanel";
import { libraryEntry } from "./sendEntry";
import { startTransfer } from "./startTransfer";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaIds: string[];
}

type Result = { kind: "direct"; count: number } | { kind: "link"; id: string; link: string | null };

export const ShareDialog: React.FC<ShareDialogProps> = ({ open, onOpenChange, mediaIds }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"friends" | "link">("friends");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) return;
    setFriendIds(new Set());
    setError(null);
    setResult(null);
  }, [open]);

  const run = async (kind: "direct" | "link") => {
    setBusy(true);
    setError(null);
    try {
      const items = await fetchMediaByIds(mediaIds);
      const { detail, link } = await startTransfer({
        kind,
        entries: items.map(libraryEntry),
        friendIds: [...friendIds],
      });
      void queryClient.invalidateQueries({ queryKey: transfersQueryKey });
      setResult(kind === "direct" ? { kind, count: friendIds.size } : { kind, id: detail.id, link });
    } catch (err) {
      setError(err instanceof TransferHttpError ? err.message : t("transfer.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("transfer.shareTitle")}</DialogTitle>
          <DialogDescription>{t("transfer.filesCount", { count: mediaIds.length })}</DialogDescription>
        </DialogHeader>

        {result?.kind === "link" ? (
          <HostPanel transferId={result.id} initialLink={result.link} onClosed={() => onOpenChange(false)} />
        ) : result?.kind === "direct" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-10 text-emerald-500" />
            <p className="text-sm">{t("transfer.sentToLibraries", { count: result.count })}</p>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              {t("transfer.done")}
            </Button>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "friends" | "link")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="friends" className="gap-1.5">
                <Users className="size-3.5" />
                {t("transfer.toFriends")}
              </TabsTrigger>
              <TabsTrigger value="link" className="gap-1.5">
                <Link2 className="size-3.5" />
                {t("transfer.toAnyone")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="friends" className="space-y-3 pt-3">
              <FriendPicker
                className="max-h-72"
                selected={friendIds}
                onToggle={(id) =>
                  setFriendIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
              <p className="text-xs text-muted-foreground">{t("transfer.libraryCopyHint")}</p>
              <Button className="w-full gap-1.5" disabled={busy || friendIds.size === 0} onClick={() => run("direct")}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {t("transfer.sendToFriends", { count: friendIds.size })}
              </Button>
            </TabsContent>
            <TabsContent value="link" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">{t("transfer.linkExplainLibrary")}</p>
              <Button className="w-full gap-1.5" disabled={busy} onClick={() => run("link")}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                {t("transfer.createLink")}
              </Button>
            </TabsContent>
            {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
