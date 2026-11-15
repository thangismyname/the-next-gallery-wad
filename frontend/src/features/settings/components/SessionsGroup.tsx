import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/services/authClient";
import { formatRelative, parseUserAgent } from "@tng/shared";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const sessionsQueryKey = ["settings", "sessions"] as const;

/** Signed-in devices (Better Auth `listSessions`): this device first, sign out one / all others. */
export const SessionsGroup: React.FC = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const currentToken = authClient.useSession().data?.session.token;
  const [busy, setBusy] = useState<string | null>(null);
  const { data: sessions = [], isPending, isError } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const sorted = [...sessions].sort((a, b) => {
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  });
  const hasOthers = sorted.some((s) => s.token !== currentToken);

  const revoke = async (token: string | "others") => {
    setBusy(token);
    try {
      if (token === "others") await authClient.revokeOtherSessions();
      else await authClient.revokeSession({ token });
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsGroup title={t("settings.sessions.title")} footer={t("settings.sessions.desc")}>
      {isPending && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 rounded-lg bg-muted" />
          <Skeleton className="h-10 rounded-lg bg-muted" />
        </div>
      )}
      {isError && (
        <p className="p-4 text-sm text-destructive">{t("settings.sessions.loadFailed")}</p>
      )}
      {sorted.map((s) => {
        const device = parseUserAgent(s.userAgent);
        const isCurrent = s.token === currentToken;
        const name =
          [device.browser, device.os].filter(Boolean).join(" · ") ||
          t("settings.sessions.unknownDevice");
        return (
          <SettingsRow
            key={s.id}
            icon={device.mobile ? Smartphone : Monitor}
            title={name}
            subtitle={[
              isCurrent ? t("settings.sessions.current") : null,
              s.ipAddress,
              formatRelative(s.updatedAt, i18n.language),
            ]
              .filter(Boolean)
              .join(" · ")}
            busy={busy === s.token}
            trailing={
              !isCurrent && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={busy !== null}
                  onClick={() => void revoke(s.token)}
                  aria-label={t("settings.sessions.revoke")}
                  title={t("settings.sessions.revoke")}
                >
                  <LogOut className="size-4" />
                </Button>
              )
            }
          />
        );
      })}
      {hasOthers && (
        <div className="px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void revoke("others")}
          >
            {busy === "others" && <Loader2 className="size-4 animate-spin" />}
            {t("settings.sessions.revokeOthers")}
          </Button>
        </div>
      )}
    </SettingsGroup>
  );
};
