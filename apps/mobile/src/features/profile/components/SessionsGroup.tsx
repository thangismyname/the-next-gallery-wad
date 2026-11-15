import { useQueryClient } from "@tanstack/react-query";
import { formatRelative, parseUserAgent } from "@tng/shared";
import { LogOut, Monitor, Smartphone } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useSession } from "@/features/auth/session";
import { authClient } from "@/lib/authClient";

import { sessionsQueryKey, useSessions } from "../useProfile";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

/** Signed-in devices (web `SessionsCard`): this device first, sign out one / all others. */
export function SessionsGroup() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const currentToken = useSession().data?.session.token;
  const { data: sessions = [], isPending, isError } = useSessions();
  const [busy, setBusy] = useState<string | null>(null);

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
    } catch {
      Alert.alert(t("lightbox.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsGroup title={t("settings.sessions.title")} footer={t("settings.sessions.desc")}>
      {isPending ? (
        <View className="gap-2 p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </View>
      ) : isError ? (
        <Text className="p-4 text-[14px] text-destructive">{t("settings.sessions.loadFailed")}</Text>
      ) : null}
      {sorted.map((s) => {
        const device = parseUserAgent(s.userAgent);
        const isCurrent = s.token === currentToken;
        const name = [device.browser, device.os].filter(Boolean).join(" · ") || t("settings.sessions.unknownDevice");
        return (
          <SettingsRow
            key={s.id}
            icon={device.mobile ? Smartphone : Monitor}
            title={name}
            subtitle={[isCurrent ? t("settings.sessions.current") : null, s.ipAddress, formatRelative(s.updatedAt, i18n.language)]
              .filter(Boolean)
              .join(" · ")}
            busy={busy === s.token}
            trailing={
              isCurrent ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.sessions.revoke")}
                  hitSlop={8}
                  disabled={busy !== null}
                  onPress={() => void revoke(s.token)}
                  className="size-9 items-center justify-center rounded-full active:bg-foreground/10"
                >
                  <Icon as={LogOut} size={18} className="text-muted-foreground" />
                </Pressable>
              )
            }
          />
        );
      })}
      {hasOthers ? (
        <SettingsRow
          title={t("settings.sessions.revokeOthers")}
          destructive
          busy={busy === "others"}
          onPress={() => void revoke("others")}
        />
      ) : null}
    </SettingsGroup>
  );
}
