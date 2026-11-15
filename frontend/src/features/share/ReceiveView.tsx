// /r/:id — trang nhận file (không cần đăng nhập). Link: /r/<id>#t=<token>&k=<khoá>.
// /r     — nhập mã 6 ký tự từ màn hình người gửi.
// Bạn bè đã đăng nhập mở /r/<id> (cookie + khoá bọc cho thiết bị này).
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileImage,
  FileVideo,
  FolderDown,
  ImagePlus,
  KeyRound,
  Loader2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LanguageToggle } from "@/components/toggles/LanguageToggle";
import { ThemeToggle } from "@/components/toggles/ThemeToggle";
import { useSession } from "@/services/authClient";
import { saveLibraryFiles } from "@/services/transfers";
import { formatBytes } from "@tng/shared";
import { getInitials } from "@tng/shared";
import { cn } from "@/lib/utils";
import { canPickFolder, saveToDevice, saveToFolder, saveToLibrary } from "./engine/save";
import { removeTransferData } from "./engine/sink";
import { CodeEntry } from "./components/CodeEntry";
import { ViaBadge } from "./components/ViaBadge";
import { parseReceiveFragment, useTransferReceiver } from "./useTransferEngines";

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { data: session } = useSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-4">
        <Link to={session ? "/gallery" : "/landing"} className="font-heading text-lg font-semibold">
          The Next Gallery
        </Link>
        <div className="flex items-center gap-1">
          {session && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/share?tab=inbox">{t("transfer.backToApp")}</Link>
            </Button>
          )}
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16">{children}</main>
    </div>
  );
};

export const ReceiveCodeView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Shell>
      <Card className="mx-auto mt-10 max-w-md gap-4 p-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-semibold">{t("transfer.receiveTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("transfer.receiveCodeHint")}</p>
        </div>
        <CodeEntry onResolved={(id, token) => navigate(`/r/${id}#t=${encodeURIComponent(token)}`)} />
      </Card>
    </Shell>
  );
};

export const ReceiveView: React.FC = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { hash } = useLocation();
  // Đọc 1 lần — giữ nguyên khi URL đổi (không phụ thuộc #fragment về sau).
  const [{ token, key }] = useState(() => parseReceiveFragment(hash));
  const { data: session } = useSession();
  const { receiver, state } = useTransferReceiver(id, token, key);
  const [saving, setSaving] = useState<null | "device" | "folder" | "library">(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const detail = state?.detail ?? null;
  // Bạn bè gửi ảnh thư viện → đã nằm sẵn trong thư viện người nhận (server copy).
  const copiedToLibrary = detail?.role === "recipient";
  const files = useMemo(
    () => (detail?.files ?? []).filter((f) => !(copiedToLibrary && f.source === "library")),
    [detail, copiedToLibrary],
  );
  const copiedCount = (detail?.files.length ?? 0) - files.length;
  const doneFiles = files.filter((f) => state?.files[f.id]?.status === "done");
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const receivedBytes = files.reduce((sum, f) => sum + Math.min(f.size, state?.files[f.id]?.bytes ?? 0), 0);
  const needsDevice = files.some((f) => f.source === "device");

  if (!state || (!detail && !state.error)) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!detail || (state.error && state.error.code !== "TRANSFER_FULL" && !files.length)) {
    return (
      <Shell>
        <Card className="mx-auto mt-10 max-w-md items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("transfer.unavailable")}</p>
          <p className="text-sm text-muted-foreground">{state.error?.message}</p>
        </Card>
      </Shell>
    );
  }

  const save = async (mode: "device" | "folder" | "library") => {
    const done = doneFiles.map((f) => state.files[f.id].file!).filter(Boolean);
    setSaving(mode);
    setSaveMessage(null);
    try {
      if (mode === "device") await saveToDevice(done);
      else if (mode === "folder") await saveToFolder(done);
      else {
        const library = doneFiles.filter((f) => f.source === "library").map((f) => f.id);
        const device = doneFiles.filter((f) => f.source === "device").map((f) => state.files[f.id].file!);
        if (library.length) await saveLibraryFiles(detail.id, library, token);
        if (device.length) await saveToLibrary(device);
        setSaveMessage(t("transfer.savedToLibrary", { count: doneFiles.length }));
      }
      if (doneFiles.length === files.length && mode !== "device") void removeTransferData(detail.id);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setSaveMessage(err instanceof Error ? err.message : t("transfer.saveFailed"));
      }
    } finally {
      setSaving(null);
    }
  };

  const connection = (() => {
    if (!needsDevice) return null;
    if (state.link === "p2p" || state.link === "turn") {
      return { icon: Wifi, text: t(state.link === "p2p" ? "transfer.conn.p2p" : "transfer.conn.turn"), ok: true };
    }
    if (!state.hostOnline) return { icon: WifiOff, text: t("transfer.conn.senderOffline"), ok: false };
    if (state.link === "failed") return { icon: WifiOff, text: t("transfer.conn.relay"), ok: false };
    return { icon: Loader2, text: t("transfer.conn.connecting"), ok: false, spin: true };
  })();

  return (
    <Shell>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {detail.sender?.avatarUrl ? <AvatarImage src={detail.sender.avatarUrl} alt="" /> : null}
            <AvatarFallback>{getInitials(detail.sender?.name ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold">
              {t("transfer.sentYou", { name: detail.sender?.name ?? "", count: detail.files.length })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatBytes(totalBytes)}
              {copiedCount > 0 && ` · ${t("transfer.copiedToLibrary", { count: copiedCount })}`}
            </p>
          </div>
        </div>

        {state.error?.code === "TRANSFER_FULL" && (
          <p className="text-sm text-destructive">{state.error.message}</p>
        )}

        {files.length > 0 && (
          <Card className="gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              {connection && (
                <span className={cn("flex items-center gap-1.5", connection.ok && "text-emerald-600 dark:text-emerald-400")}>
                  <connection.icon className={cn("size-3.5", connection.spin && "animate-spin")} />
                  {connection.text}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                {state.keyState === "ready" ? <ShieldCheck className="size-3.5" /> : <KeyRound className="size-3.5" />}
                {t(`transfer.key.${state.keyState}`)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {files.map((f) => {
                const fs = state.files[f.id];
                const thumb = state.thumbs[f.id];
                const pct = f.size ? Math.min(100, ((fs?.bytes ?? 0) / f.size) * 100) : fs?.status === "done" ? 100 : 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={fs?.status !== "done"}
                    onClick={() => fs?.file && void saveToDevice([fs.file])}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted/30 text-left"
                  >
                    {thumb ? (
                      <img src={thumb} alt={f.name} className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center">
                        {f.mime.startsWith("video/") ? (
                          <FileVideo className="size-8 text-muted-foreground" />
                        ) : (
                          <FileImage className="size-8 text-muted-foreground" />
                        )}
                      </span>
                    )}
                    {fs?.status === "done" && (
                      <CheckCircle2 className="absolute top-1.5 right-1.5 size-5 rounded-full bg-background/80 text-emerald-500" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 space-y-1 bg-linear-to-t from-black/80 to-transparent p-2">
                      <span className="block truncate text-xs font-medium text-white">{f.name}</span>
                      <span className="flex items-center justify-between gap-1 text-[10px] text-white/70">
                        {formatBytes(f.size)}
                        {fs?.via && <ViaBadge via={fs.via} className="border-white/30 text-white/80" />}
                      </span>
                      {(fs?.status === "receiving" || fs?.status === "queued") && (
                        <Progress value={pct} className="bg-white/20" />
                      )}
                      {fs?.status === "error" && <span className="block text-[10px] text-red-300">{fs.error}</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {state.running && (
                <div className="space-y-1">
                  <Progress value={totalBytes ? (receivedBytes / totalBytes) * 100 : 0} />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatBytes(receivedBytes)} / {formatBytes(totalBytes)}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {doneFiles.length < files.length && (
                  <Button disabled={state.running || state.closed} onClick={() => void receiver?.receive(files.map((f) => f.id))} className="gap-1.5">
                    {state.running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {state.running ? t("transfer.receiving") : t("transfer.receiveAll")}
                  </Button>
                )}
                {doneFiles.length > 0 && (
                  <>
                    <Button variant={doneFiles.length === files.length ? "default" : "outline"} disabled={!!saving} onClick={() => void save("device")} className="gap-1.5">
                      {saving === "device" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      {t("transfer.saveDevice", { count: doneFiles.length })}
                    </Button>
                    {canPickFolder() && doneFiles.length > 1 && (
                      <Button variant="outline" disabled={!!saving} onClick={() => void save("folder")} className="gap-1.5">
                        {saving === "folder" ? <Loader2 className="size-4 animate-spin" /> : <FolderDown className="size-4" />}
                        {t("transfer.saveFolder")}
                      </Button>
                    )}
                    {session && (
                      <Button variant="outline" disabled={!!saving} onClick={() => void save("library")} className="gap-1.5">
                        {saving === "library" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                        {t("transfer.saveLibrary")}
                      </Button>
                    )}
                  </>
                )}
              </div>
              {saveMessage && <p className="text-xs text-muted-foreground">{saveMessage}</p>}
              {!session && <p className="text-xs text-muted-foreground">{t("transfer.guestHint")}</p>}
            </div>
          </Card>
        )}

        {files.length === 0 && copiedCount > 0 && (
          <Card className="items-center gap-3 p-8 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm">{t("transfer.allInLibrary", { count: copiedCount })}</p>
            <Button asChild size="sm">
              <Link to="/gallery">{t("transfer.openGallery")}</Link>
            </Button>
          </Card>
        )}
      </div>
    </Shell>
  );
};
