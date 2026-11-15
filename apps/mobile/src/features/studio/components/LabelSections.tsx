import { tagColor } from "@tng/shared";
import { Tag } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { TAG_CHIP } from "@/lib/aiColors";
import { cn } from "@/lib/utils";

import { SECTION_ICONS, normalize } from "../tagCatalog";
import type { useTagCatalog } from "../useTagCatalog";

type Catalog = ReturnType<typeof useTagCatalog>;

/**
 * 174 detailed labels (Open Images) in their 15 sections — chip "name · count",
 * tap = open like a category (web `LabelSections`). Labels without photos above
 * their threshold are hidden unless "Show empty" / a filter is on; the filter
 * matches the current language or English, accents ignored.
 */
export function LabelSections({
  catalog,
  counts,
  onOpen,
}: {
  catalog: Catalog;
  counts: Map<string, number>;
  onOpen: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const needle = normalize(filter);
  const { sections, labels, labelName, labelModel } = catalog;

  const groups = useMemo(
    () =>
      sections
        .map((section) => ({
          section,
          labels: labels
            .filter((l) => l.section === section)
            .map((l) => ({ id: l.id, en: l.names.en, name: labelName(l), count: counts.get(l.id) ?? 0 }))
            .filter((l) => showEmpty || needle || l.count > 0)
            .filter((l) => !needle || normalize(l.name).includes(needle) || normalize(l.en).includes(needle))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.labels.length > 0),
    [sections, labels, labelName, counts, needle, showEmpty],
  );

  if (catalog.isPending) return <Skeleton className="mx-4 h-40 rounded-3xl" />;
  if (labels.length === 0) return null; // ai-service has no detailed-label probe

  const used = labels.filter((l) => (counts.get(l.id) ?? 0) > 0).length;
  return (
    <View className="gap-4">
      <View className="gap-1 px-4">
        <Text className="text-[20px] font-semibold">{t("studio.labels.title")}</Text>
        <Text className="text-[13px] text-muted-foreground">
          {t("studio.labels.desc", { n: labels.length, used })}
          {labelModel?.precision != null
            ? ` · ${t("studio.labels.precision", { pct: Math.round(labelModel.precision * 100) })}`
            : ""}
        </Text>
      </View>

      <View className="flex-row items-center gap-2 px-4">
        <FilterField value={filter} onChangeText={setFilter} placeholder={t("studio.labels.filter")} className="h-10 flex-1 rounded-full" returnKeyType="search" />
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: showEmpty }}
          onPress={() => setShowEmpty((v) => !v)}
          className={cn("h-10 justify-center rounded-full px-3.5", showEmpty ? "bg-foreground" : "bg-muted")}
        >
          <Text className={cn("text-[13px] font-medium", showEmpty && "text-background")}>
            {showEmpty ? t("studio.labels.hideEmpty") : t("studio.labels.showAll")}
          </Text>
        </Pressable>
      </View>

      {groups.length === 0 ? (
        <Text className="px-8 py-6 text-center text-[15px] text-muted-foreground">
          {needle ? t("studio.labels.noMatch") : t("studio.labels.none")}
        </Text>
      ) : (
        groups.map((g) => <SectionChips key={g.section} section={g.section} labels={g.labels} onOpen={onOpen} />)
      )}
    </View>
  );
}

const SectionChips = memo(function SectionChips({
  section,
  labels,
  onOpen,
}: {
  section: string;
  labels: { id: string; name: string; count: number }[];
  onOpen: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const SectionIcon = SECTION_ICONS[section] ?? Tag;
  const chip = TAG_CHIP[tagColor("", section)];
  return (
    <View className="gap-2 px-4">
      <View className="flex-row items-center gap-1.5">
        <Icon as={SectionIcon} size={14} className="text-muted-foreground" />
        <Text className="text-[13px] font-medium text-muted-foreground">{t(`studio.sections.${section}`)}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {labels.map((l) => (
          <Pressable
            key={l.id}
            accessibilityRole="button"
            onPress={() => onOpen(l.id)}
            // With photos → the section color (same as the Lightbox chips); empty → neutral.
            className={cn(
              "flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70",
              l.count > 0 ? chip.box : "border border-border bg-card",
            )}
          >
            <Text className={cn("text-[14px]", l.count > 0 ? chip.text : "text-muted-foreground")}>{l.name}</Text>
            <Text className={cn("text-[12px] opacity-60", l.count > 0 ? chip.text : "text-muted-foreground")}>
              {l.count}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});
