import React, { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/utils/format";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide";
import { Hourglass } from "lucide-react";
import { MorphIcon } from "morphicons/react";

import { Button } from "@/components/ui/button";
import { ShareRoomInfo } from "@/types";

interface QRTabProps {
  session: ShareRoomInfo;
  onRefresh?: () => void;
}

export const QRTab: React.FC<QRTabProps> = ({ session, onRefresh }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const expired = session.expiresAt <= now;
  const remaining = Math.max(0, Math.floor((session.expiresAt - now) / 1000));

  const joinUrl = useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/share/${session.roomCode}`;
  }, [session.roomCode]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — no-op
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="flex flex-col items-center gap-3">
        {expired ? (
          <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            {t("share.expired")}
          </div>
        ) : (
          <div className="rounded-lg bg-background p-3 ring-1 ring-border">
            <QRCodeSVG value={joinUrl} size={176} includeMargin={false} />
          </div>
        )}

        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-lg font-semibold tracking-[0.35em] text-foreground transition-opacity hover:opacity-80"
        >
          {session.roomCode}
          <MorphIcon
            icon={copied ? Check : Copy}
            size={16}
            className={copied ? "text-emerald-500" : "text-muted-foreground"}
          />
        </button>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hourglass className="size-3.5" />
          <span className="tabular-nums">
            {expired ? "00:00" : formatDuration(remaining)}
          </span>
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <div className="h-2 w-40 animate-pulse rounded-full bg-linear-to-r from-primary/20 via-primary/60 to-primary/20" />
        <p className="text-xs text-muted-foreground">{t("share.waiting")}</p>
      </div>

      {expired && onRefresh && (
        <Button size="sm" onClick={onRefresh}>
          {t("share.newCode")}
        </Button>
      )}
    </div>
  );
};
