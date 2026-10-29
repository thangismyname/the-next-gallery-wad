import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/services/authClient";
import { timeAgo } from "@/features/moments/participants";
import { parseUserAgent } from "../userAgent";

const sessionsQueryKey = ["settings", "sessions"] as const;

/**
 * Các thiết bị đang đăng nhập (Better Auth `listSessions`): phiên hiện tại
 * lên đầu, đăng xuất từng thiết bị hoặc tất cả thiết bị khác.
 */
export const SessionsCard: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const currentToken = current?.session.token;
  const [busy, setBusy] = useState<string | null>(null);

  const {
    data: sessions = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Phiên hiện tại lên đầu, còn lại theo lần hoạt động gần nhất.
  const sorted = [...sessions].sort((a, b) => {
    if (a.token === currentToken) return -1;
    if (b.token === currentToken) return 1;
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  });
  const hasOthers = sorted.some((s) => s.token !== currentToken);

  const revoke = async (token: string | "others") => {
    setBusy(token);
    if (token === "others") await authClient.revokeOtherSessions();
    else await authClient.revokeSession({ token });
    await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    setBusy(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.sessions.title")}</CardTitle>
        <CardDescription>{t("settings.sessions.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg bg-muted/40" />
          ))
        ) : isError ? (
          <p className="text-sm text-destructive">
            {t("settings.sessions.loadFailed")}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {sorted.map((s) => {
              const device = parseUserAgent(s.userAgent);
              const isCurrent = s.token === currentToken;
              const Icon = device.mobile ? Smartphone : Monitor;
              const name =
                [device.browser, device.os].filter(Boolean).join(" · ") ||
                t("settings.sessions.unknownDevice");
              return (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {name}
                      {isCurrent && (
                        <Badge variant="secondary">
                          {t("settings.sessions.current")}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        s.ipAddress,
                        timeAgo(new Date(s.updatedAt).toISOString(), t),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy !== null}
                      onClick={() => void revoke(s.token)}
                      aria-label={t("settings.sessions.revoke")}
                      title={t("settings.sessions.revoke")}
                    >
                      {busy === s.token ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasOthers && (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void revoke("others")}
          >
            {busy === "others" && <Loader2 className="size-4 animate-spin" />}
            {t("settings.sessions.revokeOthers")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
