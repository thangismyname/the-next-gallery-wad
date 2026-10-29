import React, { useEffect, useMemo, useState } from "react";
import { formatCountdown } from "@/utils/format";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { MorphIcon } from "morphicons/react";

import { Button } from "@/components/ui/button";
import { fetchInviteToken, InviteTokenData } from "@/services/friends";

export const FriendInviteCard: React.FC = () => {
  const { t } = useTranslation();
  const [invite, setInvite] = useState<InviteTokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchInviteToken();
      setInvite(data);
      setNow(Date.now());
    } catch {
      // ignore — user can retry
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick mỗi giây để đếm ngược hết hạn
  useEffect(() => {
    if (!invite?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invite?.expiresAt]);

  const token = invite?.token ?? "";
  const remainingMs = invite ? invite.expiresAt - now : 0;
  const expired = invite ? remainingMs <= 0 : false;

  const inviteUrl = useMemo(() => {
    if (!token) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/friends/invite?t=${encodeURIComponent(token)}`;
  }, [token]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <QrCode className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {t("friends.inviteTitle")}
        </h3>
        <div className="ml-auto flex items-center gap-2">
          {!loading && invite && !expired && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("friends.inviteExpiresIn", {
                time: formatCountdown(Math.round(remainingMs / 1000)),
              })}
            </span>
          )}
          {expired && (
            <span className="text-xs text-destructive">
              {t("friends.inviteExpired")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="hidden sm:inline">{t("friends.resetInvite")}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center sm:justify-center">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
          {loading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : inviteUrl && !expired ? (
            <QRCodeSVG value={inviteUrl} size={128} includeMargin={false} />
          ) : expired ? (
            <div className="flex flex-col items-center gap-2 px-2 text-center">
              <span className="text-xs text-muted-foreground">
                {t("friends.inviteExpired")}
              </span>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="size-3.5" />
                {t("friends.resetInvite")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t("friends.retry")}
            </Button>
          )}
        </div>

        <div className="flex w-full max-w-xs flex-col items-center gap-3 sm:items-stretch">
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            {t("friends.inviteHint")}
          </p>
          <div className="flex w-full items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs text-foreground">
              {inviteUrl || "..."}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              disabled={!inviteUrl || expired}
              aria-label={t("friends.copyInvite")}
            >
              <MorphIcon
                icon={copied ? Check : Copy}
                size={16}
                className={copied ? "text-emerald-500" : ""}
              />
              <span className="hidden sm:inline">
                {copied ? t("friends.copied") : t("friends.copy")}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
