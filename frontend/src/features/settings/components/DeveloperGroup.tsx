import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Code2, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { cn } from "@/lib/utils";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const STATUS_BADGE: Record<string, { variant: "secondary" | "outline" | "destructive" | "default"; className?: string; icon?: LucideIcon }> = {
  none: { variant: "secondary" },
  pending: { variant: "outline", icon: Clock },
  approved: { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600", icon: CheckCircle2 },
  rejected: { variant: "destructive", icon: XCircle },
};

/**
 * Developer Mode inline (no dialog to open): status · request with an optional
 * reason (none / rejected) · waiting note (pending) · on/off switch (approved).
 * Same group as the mobile account sheet.
 */
export const DeveloperGroup: React.FC = () => {
  const { t } = useTranslation();
  const { status, isDeveloper, devModeEnabled, request, toggle, refresh } = useDeveloperMode();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const canApply = status === "none" || status === "rejected";

  // Opening the panel re-checks the status (an admin may have just approved it).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async () => {
    setSubmitting(true);
    setError(false);
    try {
      await request(message.trim() || undefined);
      setMessage("");
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SettingsGroup title={t("developer.title")} footer={t("developer.description")}>
      <SettingsRow
        icon={Code2}
        title={t("developer.currentStatus")}
        trailing={<StatusBadge status={status} label={t(`developer.status.${status}`)} />}
      />
      {isDeveloper && (
        <SettingsRow
          title={t("developer.toggleLabel")}
          subtitle={t("developer.toggleHint")}
          trailing={
            <Button
              size="sm"
              variant={devModeEnabled ? "default" : "outline"}
              className="shrink-0"
              aria-pressed={devModeEnabled}
              onClick={() => toggle()}
            >
              {devModeEnabled ? t("developer.toggleOn") : t("developer.toggleOff")}
            </Button>
          }
        />
      )}
      {status === "pending" && <SettingsRow title={t("developer.pendingHint")} />}
      {canApply && (
        <div className="space-y-3 px-4 py-3">
          {status === "rejected" && <p className="text-xs text-destructive">{t("developer.rejectedHint")}</p>}
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("developer.messagePlaceholder")}
            rows={2}
            maxLength={1000}
            className="bg-background"
          />
          {error && <p className="text-xs text-destructive">{t("developer.error")}</p>}
          <div className="flex justify-end">
            <Button size="sm" disabled={submitting} onClick={() => void apply()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {t("developer.apply")}
            </Button>
          </div>
        </div>
      )}
    </SettingsGroup>
  );
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const { variant, className, icon: Icon } = STATUS_BADGE[status] ?? STATUS_BADGE.none;
  return (
    <Badge variant={variant} className={cn("shrink-0 gap-1", className)}>
      {Icon && <Icon className="size-3" />}
      {label}
    </Badge>
  );
}
