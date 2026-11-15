import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Tag } from "lucide-react";
import { toLanguageCode, isLabelTag, tagCatalogQueryKey, type TagLabel } from "@tng/shared";
import { fetchTagCatalog } from "@/services/media";
import { SECTION_ICONS, TAG_ICONS, isKnownTag } from "./tagCatalog";

/**
 * Danh mục nhãn chi tiết (174 nhãn Open Images, tên vi/en/ja) từ API + cách hiển
 * thị MỌI tag (17 danh mục qua i18n, nhãn chi tiết qua tên trong danh mục).
 * Danh mục chỉ đổi khi ai-service đổi model → cache lâu.
 */
export function useTagCatalog() {
  const { t, i18n } = useTranslation();
  const lang = toLanguageCode(i18n.language);
  const query = useQuery({
    queryKey: tagCatalogQueryKey,
    queryFn: fetchTagCatalog,
    staleTime: 10 * 60_000,
  });

  const labels = useMemo(() => query.data?.labels ?? [], [query.data]);
  const byId = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const labelName = useCallback((label: TagLabel) => label.names[lang] || label.names.en, [lang]);

  /** Tên + icon của 1 tag bất kỳ; null = tag lạ (không có trong danh mục). */
  const describe = useCallback(
    (tag: string): { name: string; Icon: LucideIcon; label?: TagLabel } | null => {
      if (isKnownTag(tag)) return { name: t(`studio.tags.${tag}`), Icon: TAG_ICONS[tag] };
      const label = isLabelTag(tag) ? byId.get(tag) : undefined;
      if (!label) return null;
      return { name: labelName(label), Icon: SECTION_ICONS[label.section] ?? Tag, label };
    },
    [byId, labelName, t],
  );

  return {
    ...query,
    sections: query.data?.sections ?? [],
    labels,
    labelModel: query.data?.labelModel ?? null,
    labelName,
    describe,
  };
}
