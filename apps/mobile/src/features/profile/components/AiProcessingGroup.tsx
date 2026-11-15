import { useQueryClient } from "@tanstack/react-query";
import type { AiPipeline } from "@tng/shared";
import { Check, Eye, ScanSearch, Search, Tags, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAiBackfill } from "@/hooks/useAiBackfill";
import { AI_BAR, type AiSource } from "@/lib/aiColors";
import { cn } from "@/lib/utils";

import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const PIPELINES: { id: AiPipeline; source: AiSource; icon: LucideIcon }[] = [
  { id: "tags", source: "tag", icon: Tags },
  { id: "clip", source: "clip", icon: Search },
  { id: "yolo", source: "yolo", icon: ScanSearch },
  { id: "dino", source: "dino", icon: Eye },
];

/**
 * Progress of each AI pipeline over the user's photos + batched backfill (web
 * `AiProcessingCard`): bar in the AI source color, "Process N" / Stop / done.
 */
export function AiProcessingGroup() {
  const { t } = useTranslation();
  return (
    <SettingsGroup title={t("settings.ai.title")} footer={t("settings.ai.desc")}>
      {PIPELINES.map((p) => (
        <PipelineRow key={p.id} {...p} />
      ))}
    </SettingsGroup>
  );
}

function PipelineRow({ id, source, icon }: { id: AiPipeline; source: AiSource; icon: LucideIcon }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { status, running, error, run, stop } = useAiBackfill(id, {
    // New tags / embeddings / detections → Studio, search and similar caches refresh.
    onBatch: () => void queryClient.invalidateQueries({ queryKey: ["ai"] }),
  });
  const data = status.data;
  const done = data && data.pending === 0;
  const percent = data?.total ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <SettingsRow
      icon={icon}
      title={t(`settings.ai.${id}.name`)}
      subtitle={t(`settings.ai.${id}.desc`)}
      trailing={
        !data ? null : done && !running ? (
          <View className="flex-row items-center gap-1">
            <Icon as={Check} size={15} className="text-muted-foreground" />
            <Text className="text-[13px] text-muted-foreground">{t("settings.ai.complete")}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={running ? stop : () => void run()}
            className={cn("rounded-full px-3 py-1.5 active:opacity-70", running ? "bg-background" : "bg-foreground")}
          >
            <Text className={cn("text-[13px] font-semibold", !running && "text-background")}>
              {running ? t("settings.ai.stop") : t("settings.ai.process", { n: data.pending })}
            </Text>
          </Pressable>
        )
      }
    >
      <View className="gap-1.5">
        <View className="h-1.5 overflow-hidden rounded-full bg-background">
          <View className={cn("h-full rounded-full", AI_BAR[source])} style={{ width: `${percent}%` }} />
        </View>
        <Text className="text-[12px] text-muted-foreground">
          {data ? t("settings.ai.progress", { done: data.done, total: data.total }) : "…"}
        </Text>
        {error ? <Text className="text-[12px] text-destructive">{error}</Text> : null}
      </View>
    </SettingsRow>
  );
}
