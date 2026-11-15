import { useQueryClient } from "@tanstack/react-query";
import { ScanSearch } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAiBackfill } from "@/hooks/useAiBackfill";
import { useTheme } from "@/hooks/useTheme";

/** Photos not classified yet → progress card + "Classify now" (batched backfill, web `TagProgressBanner`). */
export function TagProgressBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { status, running, error, run, stop } = useAiBackfill("tags", {
    // Each batch → category counts / covers update right away.
    onBatch: () => void queryClient.invalidateQueries({ queryKey: ["ai", "tags"] }),
  });
  const data = status.data;
  const percent = data?.total ? data.done / data.total : 0;
  if (!data || (data.pending === 0 && !running)) return null;

  return (
    <View className="mx-4 gap-3 rounded-3xl bg-muted/60 p-4">
      <View className="flex-row items-center gap-3">
        <Icon as={ScanSearch} size={22} className="text-foreground" />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold">{t("studio.pendingTitle", { n: data.pending })}</Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("settings.ai.progress", { done: data.done, total: data.total })}
          </Text>
        </View>
        {running ? (
          <Button variant="ghost" size="sm" onPress={stop}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
            <Text>{t("settings.ai.stop")}</Text>
          </Button>
        ) : (
          <Button size="sm" className="rounded-full" onPress={() => void run()}>
            <Text>{t("studio.classifyNow")}</Text>
          </Button>
        )}
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-background">
        <View className="h-full rounded-full bg-primary" style={{ width: `${Math.round(percent * 100)}%` }} />
      </View>
      {error ? <Text className="text-[13px] text-destructive">{error}</Text> : null}
    </View>
  );
}
