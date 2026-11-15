// Màn hình người gửi cho 1 phiên: QR / link / mã 6 số (phiên link), người nhận
// + tiến độ + đường đi (P2P / TURN / relay / server / copy), đẩy lên relay
// (mã hoá) để nhận khi mình offline, thu hồi.
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  CloudUpload,
  Copy,
  Hourglass,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  fetchTransfer,
  refreshTransferCode,
  revokeTransfer,
  transfersQueryKey,
  type TransferDetail,
} from "@/services/transfers";
import { formatBytes, formatCountdown } from "@tng/shared";
import { cn } from "@/lib/utils";
import { hostRegistry } from "../engine/hostRegistry";
import { RELAY_MAX_BYTES } from "../engine/protocol";
import { recallReceiveLink } from "../startTransfer";
import { useTransferHost } from "../useTransferEngines";
import { ViaBadge } from "./ViaBadge";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {label}
    </Button>
  );
};

const LinkSection: React.FC<{ detail: TransferDetail; link: string | null; now: number }> = ({
  detail,
  link,
  now,
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(detail.code);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCode(detail.code), [detail.code]);
  const codeLeft = code ? Math.max(0, Math.floor((new Date(code.expiresAt).getTime() - now) / 1000)) : 0;

  const newCode = async () => {
    setBusy(true);
    try {
      setCode(await refreshTransferCode(detail.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      {link ? (
        <div className="rounded-xl bg-white p-3 ring-1 ring-border">
          <QRCodeSVG value={link} size={168} />
        </div>
      ) : (
        <div className="flex size-[192px] items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t("transfer.linkOtherDevice")}
        </div>
      )}
      <div className="flex w-full flex-1 flex-col gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          {t("transfer.e2eHint")}
        </p>
        {link && (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={link} label={t("transfer.copyLink")} />
            {typeof navigator.share === "function" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void navigator.share({ url: link }).catch(() => {})}
              >
                <Link2 className="size-3.5" />
                {t("transfer.shareLink")}
              </Button>
            )}
          </div>
        )}
        <div className="rounded-lg border border-border/60 p-3">
          <p className="mb-1 text-xs text-muted-foreground">{t("transfer.codeLabel")}</p>
          {code && codeLeft > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-semibold tracking-[0.3em]">{code.value}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Hourglass className="size-3.5" />
                {formatCountdown(codeLeft)}
              </span>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="gap-1.5 px-0" disabled={busy || !detail.open} onClick={newCode}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t("transfer.newCode")}
            </Button>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("transfer.codeHint", { origin: window.location.host })}
          </p>
        </div>
      </div>
    </div>
  );
};

interface HostPanelProps {
  transferId: string;
  /** Link vừa tạo (có khoá) — không có thì lấy lại từ máy này nếu được. */
  initialLink?: string | null;
  onClosed?: () => void;
}

export const HostPanel: React.FC<HostPanelProps> = ({ transferId, initialLink, onClosed }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { host, state } = useTransferHost(transferId);
  const [link, setLink] = useState<string | null>(initialLink ?? null);
  const [revoking, setRevoking] = useState(false);

  // Không còn phát (tải lại trang / chỉ ảnh thư viện) → đọc trạng thái từ server.
  const { data: fetched } = useQuery({
    queryKey: [...transfersQueryKey, transferId],
    queryFn: () => fetchTransfer(transferId),
    refetchInterval: host ? false : 5000,
  });
  const detail = state?.detail ?? fetched ?? null;
  const now = useNow(Boolean(detail?.open));

  useEffect(() => {
    if (!initialLink) void recallReceiveLink(transferId).then((l) => l && setLink(l));
  }, [transferId, initialLink]);

  const deviceFiles = useMemo(() => detail?.files.filter((f) => f.source === "device") ?? [], [detail]);
  const relayDone = deviceFiles.reduce(
    (sum, f) => sum + Math.min(state?.relay[f.id] ?? f.relayParts, f.partCount),
    0,
  );
  const relayTotal = deviceFiles.reduce((sum, f) => sum + f.partCount, 0);
  const deviceBytes = deviceFiles.reduce((sum, f) => sum + f.size, 0);
  const totalBytes = detail?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;

  if (!detail) {
    return (
      <Card className="flex items-center justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const left = Math.max(0, Math.floor((new Date(detail.expiresAt).getTime() - now) / 1000));
  const peers = Object.values(state?.peers ?? {});
  const recipients = detail.recipients ?? [];

  const revoke = async () => {
    setRevoking(true);
    try {
      await revokeTransfer(transferId);
      hostRegistry.remove(transferId);
      void queryClient.invalidateQueries({ queryKey: transfersQueryKey });
      onClosed?.();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card className="gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            {t(detail.kind === "link" ? "transfer.linkTitle" : "transfer.directTitle", {
              count: detail.files.length,
            })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {formatBytes(totalBytes)} ·{" "}
            {detail.open ? t("transfer.expiresIn", { time: formatCountdown(left) }) : t("transfer.closed")}
          </p>
        </div>
        {deviceFiles.length > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
              state?.online ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
            )}
          >
            {state?.online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {state?.online ? t("transfer.hosting") : t("transfer.notHosting")}
          </span>
        )}
      </div>

      {detail.kind === "link" && detail.open && <LinkSection detail={detail} link={link} now={now} />}

      {deviceFiles.length > 0 && detail.open && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CloudUpload className="size-4" />
              {t("transfer.relayTitle")}
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {relayTotal ? Math.round((relayDone / relayTotal) * 100) : 0}%
            </span>
          </div>
          <Progress value={relayTotal ? (relayDone / relayTotal) * 100 : 0} />
          <p className="text-xs text-muted-foreground">
            {relayDone >= relayTotal
              ? t("transfer.relayReady")
              : deviceBytes > RELAY_MAX_BYTES
                ? t("transfer.relayTooBig", { size: formatBytes(RELAY_MAX_BYTES) })
                : t("transfer.relayHint")}
          </p>
          {state?.relayError && <p className="text-xs text-destructive">{state.relayError}</p>}
          {host && relayDone < relayTotal && deviceBytes <= RELAY_MAX_BYTES && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={state?.relayBusy}
              onClick={() => host.relayFiles()}
            >
              {state?.relayBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
              {state?.relayBusy ? t("transfer.relayUploading") : t("transfer.relayStart")}
            </Button>
          )}
          {!host && relayDone < relayTotal && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("transfer.reopenToHost")}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t("transfer.recipients", { count: recipients.length })}
        </p>
        {recipients.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("transfer.noRecipientsYet")}</p>
        ) : (
          <ul className="space-y-2">
            {recipients.map((r) => {
              const live = peers.find((p) => p.recipientId === r.id);
              const sendingPct = live?.sending ? (live.sending.bytes / Math.max(1, live.sending.size)) * 100 : null;
              const pct = r.status === "done" ? 100 : totalBytes ? Math.min(100, (r.bytes / totalBytes) * 100) : 0;
              return (
                <li key={r.id} className="space-y-1.5 rounded-lg border border-border/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted">
                      <User className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {r.name ?? (r.guest ? t("transfer.guest") : t("transfer.someone"))}
                    </span>
                    <ViaBadge via={live?.via ?? r.via} />
                    <span className="text-xs text-muted-foreground">
                      {live?.queued ? t("transfer.status.queued") : t(`transfer.status.${r.status}`)}
                    </span>
                  </div>
                  {(sendingPct !== null || (r.status !== "pending" && r.status !== "declined")) && (
                    <Progress value={sendingPct ?? pct} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detail.open && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" disabled={revoking} onClick={revoke}>
            {revoking ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {t("transfer.revoke")}
          </Button>
        </div>
      )}
    </Card>
  );
};
