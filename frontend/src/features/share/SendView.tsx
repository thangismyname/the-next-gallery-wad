// features/share/SendView.tsx — /share ("Gửi nhanh")
// Gửi: chọn file (máy / thư viện) → gửi bạn bè (chọn người, không cần phòng)
//      hoặc tạo link / QR / mã cho bất kỳ ai (không cần đăng nhập).
// Đã nhận: hộp nhận từ bạn bè + nhập mã. Đã gửi: lịch sử, mở lại bảng điều khiển.
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Archive,
  FileImage,
  FileVideo,
  Images,
  Link2,
  Loader2,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickMedia } from "@/features/media-picker/pickMedia";
import { fetchTransfers, transfersQueryKey, TransferHttpError } from "@/services/transfers";
import { usePresence } from "@/hooks/usePresence";
import { formatBytes } from "@tng/shared";
import { exportLibrary } from "@/services/media";
import { FriendPicker } from "./components/FriendPicker";
import { HostPanel } from "./components/HostPanel";
import { CodeEntry } from "./components/CodeEntry";
import { InboxList, SentList } from "./components/TransferHistory";
import { RELAY_MAX_BYTES } from "./engine/protocol";
import {
  entryIsVideo,
  entryName,
  entryPreview,
  entrySize,
  libraryEntry,
  localEntry,
  type SendEntry,
} from "./sendEntry";
import { startTransfer } from "./startTransfer";

type Target = "friends" | "link";
const RECEIVER_LIMITS = [null, 1, 5, 20] as const;

const FileTile: React.FC<{ entry: SendEntry; onRemove: () => void }> = ({ entry, onRemove }) => {
  const { t } = useTranslation();
  const preview = entryPreview(entry);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30">
      {preview ? (
        <img src={preview} alt={entryName(entry)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          {entryIsVideo(entry) ? (
            <FileVideo className="size-8 text-muted-foreground" />
          ) : (
            <FileImage className="size-8 text-muted-foreground" />
          )}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2">
        <p className="truncate text-xs font-medium text-white">{entryName(entry)}</p>
        <p className="text-[10px] text-white/70">{formatBytes(entrySize(entry))}</p>
      </div>
      {entry.kind === "library" && (
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Images className="size-3" />
          {t("transfer.fromLibrary")}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={t("transfer.remove")}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};

export const SendView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "send";
  const activeId = params.get("t");
  const online = usePresence((s) => s.online);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<SendEntry[]>([]);
  const [target, setTarget] = useState<Target>(params.get("to") ? "friends" : "link");
  const [friendIds, setFriendIds] = useState<Set<string>>(
    () => new Set(params.get("to") ? [params.get("to")!] : []),
  );
  const [maxReceivers, setMaxReceivers] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const previewUrls = useRef(new Set<string>());

  const { data: history } = useQuery({
    queryKey: transfersQueryKey,
    queryFn: fetchTransfers,
    enabled: tab !== "send",
  });

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const setTab = (next: string) =>
    setParams((p) => {
      p.set("tab", next);
      p.delete("t");
      return p;
    });

  const openTransfer = (id: string) => setParams({ tab: "send", t: id });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).map((file) => {
      const entry = localEntry(file);
      if (file.type.startsWith("image/")) {
        entry.previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(entry.previewUrl);
      }
      return entry;
    });
    setEntries((prev) => [...prev, ...next]);
  };

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  // Chọn lại ảnh thư viện (đánh dấu sẵn các ảnh đã thêm), giữ nguyên file từ máy.
  const openLibrary = async () => {
    const current = entries.flatMap((e) => (e.kind === "library" ? [e.item] : []));
    const picked = await pickMedia({
      title: t("transfer.libraryTitle"),
      description: t("transfer.libraryDescription"),
      initialSelected: current,
      allowEmpty: current.length > 0,
      confirmLabel: (count) => t("transfer.libraryConfirm", { count }),
    });
    if (!picked) return;
    setEntries((prev) => [...prev.filter((e) => e.kind === "local"), ...picked.map(libraryEntry)]);
  };

  const deviceBytes = entries.reduce((sum, e) => sum + (e.kind === "local" ? e.file.size : 0), 0);
  const totalBytes = entries.reduce((sum, e) => sum + entrySize(e), 0);
  const offlineFriends = [...friendIds].filter((id) => !online[id]).length;
  const canSend = entries.length > 0 && !sending && (target === "link" || friendIds.size > 0);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const { detail, link } = await startTransfer({
        kind: target === "link" ? "link" : "direct",
        entries,
        friendIds: [...friendIds],
        maxReceivers,
      });
      setCreatedLink(link);
      setEntries([]);
      openTransfer(detail.id);
    } catch (err) {
      setError(err instanceof TransferHttpError ? err.message : t("transfer.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">{t("transfer.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("transfer.subtitle")}</p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="send">{t("transfer.tabSend")}</TabsTrigger>
            <TabsTrigger value="inbox">{t("transfer.tabInbox")}</TabsTrigger>
            <TabsTrigger value="sent">{t("transfer.tabSent")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={tab}>
        <TabsContent value="send" className="space-y-6">
          {activeId ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setCreatedLink(null);
                  setParams({ tab: "send" });
                }}
              >
                <ArrowLeft className="size-3.5" />
                {t("transfer.newTransfer")}
              </Button>
              <HostPanel
                transferId={activeId}
                initialLink={createdLink}
                onClosed={() => setParams({ tab: "sent" })}
              />
            </>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Card className="gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {entries.length
                      ? t("transfer.selected", { count: entries.length, size: formatBytes(totalBytes) })
                      : t("transfer.pickPrompt")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void openLibrary()}>
                      <Images className="size-3.5" />
                      {t("transfer.pickFromLibrary")}
                    </Button>
                    <Button size="sm" onClick={() => inputRef.current?.click()}>
                      <Plus className="size-3.5" />
                      {t("transfer.pickFiles")}
                    </Button>
                  </div>
                </div>
                {entries.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {entries.map((entry) => (
                      <FileTile key={entry.id} entry={entry} onRemove={() => removeEntry(entry.id)} />
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-sm text-muted-foreground transition-colors hover:bg-muted/30"
                  >
                    <FileImage className="size-8 animate-float opacity-60" />
                    {t("transfer.filesEmpty")}
                  </button>
                )}
              </Card>

              <Card className="gap-4 p-5">
                <Tabs value={target} onValueChange={(v) => setTarget(v as Target)}>
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
                  <TabsContent value="friends" className="pt-3">
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
                    {offlineFriends > 0 && deviceBytes > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {deviceBytes > RELAY_MAX_BYTES
                          ? t("transfer.offlineTooBig", { size: formatBytes(RELAY_MAX_BYTES) })
                          : t("transfer.offlineWillRelay", { count: offlineFriends })}
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="link" className="space-y-3 pt-3">
                    <p className="text-sm text-muted-foreground">{t("transfer.linkExplain")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("transfer.maxReceivers")}</span>
                      {RECEIVER_LIMITS.map((n) => (
                        <Button
                          key={String(n)}
                          size="sm"
                          variant={maxReceivers === n ? "default" : "outline"}
                          onClick={() => setMaxReceivers(n)}
                        >
                          {n === null ? t("transfer.unlimited") : n}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{t("transfer.keepOpenHint")}</p>
                  <Button disabled={!canSend} onClick={send} className="gap-1.5">
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {target === "link"
                      ? t("transfer.createLink")
                      : t("transfer.sendToFriends", { count: friendIds.size })}
                  </Button>
                </div>
              </Card>

              {/* Chuyển nền tảng: cả thư viện → 1 zip định dạng Google Takeout. */}
              <Card className="flex-row flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">{t("transfer.export.title")}</p>
                  <p className="text-xs text-muted-foreground">{t("transfer.export.description")}</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={exportLibrary}>
                  <Archive className="size-3.5" />
                  {t("transfer.export.button")}
                </Button>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="inbox" className="space-y-4">
          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">{t("transfer.receiveByCode")}</p>
            <CodeEntry onResolved={(id, token) => navigate(`/r/${id}#t=${encodeURIComponent(token)}`)} />
          </Card>
          <Card className="p-3">
            <InboxList items={history?.inbox} onOpen={(id) => navigate(`/r/${id}`)} />
          </Card>
        </TabsContent>

        <TabsContent value="sent">
          <Card className="p-3">
            <SentList items={history?.sent} onOpen={openTransfer} />
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
};
