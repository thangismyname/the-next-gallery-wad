import { router } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { TabScreen } from "@/features/navigation";
import { fadeIn } from "@/lib/motion";
import { SEGMENT_SHADOW, cn } from "@/lib/utils";

import { CategoryCard } from "./components/CategoryCard";
import { LabelSections } from "./components/LabelSections";
import { TagProgressBanner } from "./components/TagProgressBanner";
import { TAG_GROUPS, TAG_ICONS } from "./tagCatalog";
import { useTagCatalog } from "./useTagCatalog";
import { useTagSummary } from "./useTagData";

const GAP = 12;

/**
 * AI Studio tab (web `StudioView`): the thesis' two AI parts — **Classification**
 * (17 content categories by model group + 174 detailed labels, each with a
 * confidence) and Editing (presets / LUT, not built yet → disabled segment).
 * Tap a category / label → `/studio/<tag>` (photos sorted by confidence).
 */
export function StudioScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const summary = useTagSummary();
  const catalog = useTagCatalog();
  const counts = useMemo(() => new Map([...summary.byTag].map(([tag, s]) => [tag, s.count])), [summary.byTag]);

  const columns = Math.max(2, Math.floor((width - left - right) / 200));
  const card = (width - left - right - 32 - GAP * (columns - 1)) / columns;
  const open = useCallback((tag: string) => router.push({ pathname: "/studio/[tag]", params: { tag } }), []);

  return (
    <TabScreen title={t("studio.title")}>
      <Animated.View entering={fadeIn} className="gap-7 pb-6 pt-2">
        <View className="gap-3 px-4">
          <View className="flex-row items-center gap-3">
            <View className="size-10 items-center justify-center rounded-2xl bg-muted">
              <Icon as={Sparkles} size={20} className="text-foreground" />
            </View>
            <Text className="flex-1 text-[14px] text-muted-foreground">{t("studio.subtitle")}</Text>
          </View>
          <Segments />
        </View>

        <TagProgressBanner />

        {summary.isError ? (
          <View className="items-center gap-3 px-8 py-10">
            <Text className="text-center text-[15px] text-muted-foreground">{t("studio.loadFailed")}</Text>
            <Button variant="outline" onPress={() => void summary.refetch()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : (
          TAG_GROUPS.map(({ group, tags }) => (
            <View key={group} className="gap-3">
              <View className="gap-0.5 px-4">
                <Text className="text-[20px] font-semibold">{t(`studio.groups.${group}.title`)}</Text>
                <Text className="text-[13px] text-muted-foreground">{t(`studio.groups.${group}.desc`)}</Text>
              </View>
              <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
                {tags.map((tag) =>
                  summary.isPending ? (
                    <Skeleton key={tag} className="rounded-3xl" style={{ width: card, height: card * 0.75 }} />
                  ) : (
                    <CategoryCard
                      key={tag}
                      tag={tag}
                      icon={TAG_ICONS[tag]}
                      summary={summary.byTag.get(tag)}
                      width={card}
                      onOpen={open}
                    />
                  ),
                )}
              </View>
            </View>
          ))
        )}

        <LabelSections catalog={catalog} counts={counts} onOpen={open} />
      </Animated.View>
    </TabScreen>
  );
}

/** Classification | Editing (coming soon) — the web tabs, as a segmented control. */
function Segments() {
  const { t } = useTranslation();
  const items = [
    { key: "classify", label: t("studio.tabClassify"), active: true },
    { key: "edit", label: t("studio.tabEdit"), active: false },
  ];
  return (
    <View className="flex-row rounded-full bg-muted p-1">
      {items.map((item) => (
        <View
          key={item.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active, disabled: !item.active }}
          className={cn(
            "h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full",
            item.active && "bg-background",
          )}
          style={item.active ? SEGMENT_SHADOW : undefined}
        >
          <Text className={cn("text-[14px] font-semibold", !item.active && "text-muted-foreground")}>{item.label}</Text>
          {!item.active ? (
            <View className="rounded-full border border-border px-1.5 py-px">
              <Text className="text-[10px] text-muted-foreground">{t("studio.comingSoon")}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
