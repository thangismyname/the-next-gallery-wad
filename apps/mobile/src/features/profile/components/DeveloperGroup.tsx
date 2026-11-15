import { Code2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/text";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const STATUS_PILL: Record<string, string> = {
  none: "bg-background text-muted-foreground",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200",
};

/**
 * Developer Mode right in the account sheet (web `DeveloperModeDialog`, inline):
 * status · request with an optional reason (none / rejected) · waiting note
 * (pending) · on/off switch (approved) — on = YOLO boxes over Lightbox photos.
 */
export function DeveloperGroup() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { status, isDeveloper, enabled, setEnabled, request } = useDeveloperMode();
  const [message, setMessage] = useState("");
  const canApply = status === "none" || status === "rejected";

  return (
    <SettingsGroup title={t("developer.title")} footer={t("developer.description")}>
      <SettingsRow
        icon={Code2}
        title={t("developer.currentStatus")}
        trailing={
          <View className={cn("rounded-full px-2.5 py-0.5", STATUS_PILL[status])}>
            <Text className={cn("text-[12px] font-semibold", STATUS_PILL[status])}>{t(`developer.status.${status}`)}</Text>
          </View>
        }
      />
      {isDeveloper ? (
        <SettingsRow
          title={t("developer.toggleLabel")}
          subtitle={t("developer.toggleHint")}
          trailing={<Switch value={enabled} onValueChange={setEnabled} accessibilityLabel={t("developer.toggleLabel")} />}
        />
      ) : null}
      {status === "pending" ? <SettingsRow title={t("developer.pendingHint")} /> : null}
      {canApply ? (
        <View className="gap-3 px-4 py-3">
          {status === "rejected" ? <Text className="text-[13px] text-destructive">{t("developer.rejectedHint")}</Text> : null}
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t("developer.messagePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={1000}
            className="min-h-16 rounded-2xl bg-background px-3.5 py-2.5 font-sans text-[15px] text-foreground"
            style={{ textAlignVertical: "top" }}
          />
          {request.isError ? <Text className="text-[13px] text-destructive">{t("developer.error")}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={request.isPending}
            onPress={() => request.mutate(message.trim() || undefined, { onSuccess: () => setMessage("") })}
            className={cn("h-10 items-center justify-center rounded-full bg-foreground active:opacity-80", request.isPending && "opacity-60")}
          >
            <Text className="text-[15px] font-semibold text-background">{t("developer.apply")}</Text>
          </Pressable>
        </View>
      ) : null}
    </SettingsGroup>
  );
}
