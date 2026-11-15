import { useQuery } from "@tanstack/react-query";
import { tagSummaryQueryKey } from "@tng/shared";
import { Image } from "expo-image";
import { Clock, ScanSearch, Sparkles, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { isKnownTag } from "@/features/studio/tagCatalog";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { AI_CHIP } from "@/lib/aiColors";
import { cn } from "@/lib/utils";
import { mediaApi } from "@/services";

import { useRecentSearches } from "../useSearch";

const OBJECT_CHIPS = 14;

/**
 * Before typing: recent searches, the library's AI content categories (cover +
 * count — tap searches the category name, which the hybrid search understands
 * in vi / en / ja) and the most common YOLO objects.
 */
export function SearchHome({ width, onPick }: { width: number; onPick: (query: string) => void }) {
  const { t } = useTranslation();
  const { recent, remove, clear } = useRecentSearches();
  const { describe } = useTagCatalog();
  const tags = useQuery({ queryKey: tagSummaryQueryKey, queryFn: mediaApi.fetchTagSummary, staleTime: 5 * 60_000 });
  const objects = useQuery({
    queryKey: ["ai", "objects", "classes"],
    queryFn: mediaApi.fetchObjectClasses,
    staleTime: 5 * 60_000,
  });

  const categories = (tags.data ?? []).filter((s) => isKnownTag(s.tag) && s.count > 0).sort((a, b) => b.count - a.count);
  const columns = Math.max(3, Math.floor(width / 130));
  const tile = (width - 32 - 8 * (columns - 1)) / columns;

  return (
    <View className="gap-7">
      {recent.length ? (
        <View>
          <SectionTitle icon={Clock} title={t("search.recent")}>
            <Pressable hitSlop={8} onPress={clear} className="active:opacity-60">
              <Text className="text-[15px] text-muted-foreground">{t("search.clearRecent")}</Text>
            </Pressable>
          </SectionTitle>
          {recent.map((q) => (
            <Pressable
              key={q}
              onPress={() => onPick(q)}
              className="flex-row items-center gap-3 px-4 py-2.5 active:bg-foreground/5"
            >
              <Text numberOfLines={1} className="flex-1 text-base">
                {q}
              </Text>
              <Pressable
                hitSlop={10}
                accessibilityLabel={t("common.close")}
                onPress={() => remove(q)}
                className="active:opacity-60"
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {categories.length ? (
        <View>
          <SectionTitle icon={Sparkles} title={t("search.explore")} />
          <View className="flex-row flex-wrap gap-2 px-4">
            {categories.map((c) => {
              const d = describe(c.tag);
              if (!d) return null;
              return (
                <Pressable
                  key={c.tag}
                  onPress={() => onPick(d.name)}
                  className="overflow-hidden rounded-2xl bg-muted active:opacity-80"
                  style={{ width: tile, height: tile }}
                >
                  {c.coverUrl ? (
                    <Image source={{ uri: c.coverUrl }} contentFit="cover" cachePolicy="memory-disk" style={{ width: "100%", height: "100%" }} />
                  ) : null}
                  {/* Text sits on the photo → stays light-on-dark. */}
                  <View className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1.5">
                    <View className="flex-row items-center gap-1">
                      <Icon as={d.icon} size={13} className="text-white" />
                      <Text numberOfLines={1} className="flex-1 text-[14px] font-semibold text-white">
                        {d.name}
                      </Text>
                    </View>
                    <Text className="text-[12px] text-white/80">
                      {c.count} {t("search.photos")}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {objects.data?.length ? (
        <View>
          <SectionTitle icon={ScanSearch} title={t("search.objectsExplore")} />
          <View className="flex-row flex-wrap gap-2 px-4">
            {[...objects.data]
              .sort((a, b) => b.count - a.count)
              .slice(0, OBJECT_CHIPS)
              .map((o) => (
                <Pressable
                  key={o.class_name}
                  onPress={() => onPick(o.class_name)}
                  className={cn("flex-row items-center gap-1 rounded-full px-3 py-1.5 active:opacity-70", AI_CHIP.yolo.box)}
                >
                  <Text className={cn("text-[15px]", AI_CHIP.yolo.text)}>{o.class_name}</Text>
                  <Text className={cn("text-[13px] opacity-60", AI_CHIP.yolo.text)}>{o.count}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}

      {!recent.length && !categories.length && !objects.data?.length ? (
        <Text className="px-6 pt-10 text-center text-[15px] text-muted-foreground">{t("search.mobileHint")}</Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({
  icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="mb-2.5 flex-row items-center gap-2 px-4">
      <Icon as={icon} size={16} className="text-muted-foreground" />
      <Text className="flex-1 text-[17px] font-semibold">{title}</Text>
      {children}
    </View>
  );
}
