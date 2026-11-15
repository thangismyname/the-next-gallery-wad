import { useQuery } from "@tanstack/react-query";
import { isLabelTag, tagCatalogQueryKey, toLanguageCode, type TagLabel } from "@tng/shared";
import { Tag, type LucideIcon } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { mediaApi } from "@/services";

import { SECTION_ICONS, TAG_ICONS, isKnownTag } from "./tagCatalog";

/**
 * Names + icons of AI tags (web `useTagCatalog`): the 17 categories from i18n,
 * the detailed "oi.*" labels from the API catalog in the current language.
 */
export function useTagCatalog(enabled = true) {
  const { t, i18n } = useTranslation();
  const lang = toLanguageCode(i18n.language);
  const query = useQuery({
    queryKey: tagCatalogQueryKey,
    queryFn: mediaApi.fetchTagCatalog,
    staleTime: 10 * 60_000,
    enabled,
  });
  const labels = useMemo(() => query.data?.labels ?? [], [query.data]);
  const byId = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const labelName = useCallback((label: TagLabel) => label.names[lang] || label.names.en, [lang]);

  /** Name + icon of any tag; null = unknown tag (not in the catalog). */
  const describe = useCallback(
    (tag: string): { name: string; icon: LucideIcon; label?: TagLabel } | null => {
      if (isKnownTag(tag)) return { name: t(`studio.tags.${tag}`), icon: TAG_ICONS[tag] };
      const label = isLabelTag(tag) ? byId.get(tag) : undefined;
      if (!label) return null;
      return { name: labelName(label), icon: SECTION_ICONS[label.section] ?? Tag, label };
    },
    [byId, labelName, t],
  );
  return {
    describe,
    labelName,
    labels,
    sections: query.data?.sections ?? [],
    labelModel: query.data?.labelModel ?? null,
    isPending: query.isPending,
  };
}
