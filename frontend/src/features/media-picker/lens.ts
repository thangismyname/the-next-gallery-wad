// "Lens" = picker đang xem gì: 1 bộ lọc loại (tất cả/ảnh/video/yêu thích), 1
// phạm vi Spotlight (Yêu thích / nhãn / album), 1 tag AI, hoặc ảnh đã chọn.
// Gõ chữ → gợi ý giống Spotlight (tên nhãn / album / màu nhãn / tên tag ở mọi
// ngôn ngữ), Tab / Enter để chọn.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { LANGUAGES, isLabelTag, tagSummaryQueryKey, type MediaFilter } from "@tng/shared";
import { fetchTagSummary } from "@/services/media";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { normalize, suggestScopes, type SearchScope } from "@/features/search/searchScope";
import { useSearchScopes } from "@/features/search/useSearchScopes";

export type Lens =
  | { kind: "filter"; filter: MediaFilter }
  | { kind: "scope"; scope: SearchScope }
  | { kind: "tag"; tag: string; name: string }
  | { kind: "selected" };


export const lensKey = (lens: Lens) =>
  lens.kind === "filter"
    ? `filter:${lens.filter}`
    : lens.kind === "scope"
      ? lens.scope.key
      : lens.kind === "tag"
        ? `tag:${lens.tag}`
        : "selected";

export const lensName = (lens: Lens) =>
  lens.kind === "scope" ? lens.scope.name : lens.kind === "tag" ? lens.name : "";

export interface TagOption {
  tag: string;
  name: string;
  count: number;
  aliases: string[];
  /** Nhãn chi tiết ("oi.*") — false = 1 trong 17 danh mục. */
  label: boolean;
}

// Hàng chip của picker: 17 danh mục + chừng này nhãn chi tiết nhiều ảnh nhất
// (gõ tên vẫn gợi ý được mọi nhãn).
const CHIP_LABELS = 10;

/** Tag AI có ảnh (≥ ngưỡng), nhiều ảnh trước; tên ở mọi ngôn ngữ để gõ là ra. */
export function useTagOptions(enabled: boolean): TagOption[] {
  const { i18n } = useTranslation();
  const { describe } = useTagCatalog();
  const { data } = useQuery({
    queryKey: tagSummaryQueryKey,
    queryFn: fetchTagSummary,
    enabled,
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () =>
      (data ?? [])
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count)
        .flatMap((s) => {
          const display = describe(s.tag);
          if (!display) return []; // nhãn lạ (danh mục chưa tải / model cũ)
          const names = display.label
            ? [display.label.names.vi, display.label.names.en, display.label.names.ja]
            : LANGUAGES.map(({ code }) => i18n.getFixedT(code)(`studio.tags.${s.tag}`));
          return [
            {
              tag: s.tag,
              name: display.name,
              count: s.count,
              aliases: [...new Set([s.tag, ...names].map(normalize))],
              label: isLabelTag(s.tag),
            },
          ];
        }),
    [data, describe, i18n],
  );
}

export type Suggestion = { lens: Lens; key: string };

const startsWord = (alias: string, q: string) =>
  alias.startsWith(q) || alias.split(" ").some((w) => w.startsWith(q));

/** Gợi ý khi gõ: phạm vi Spotlight (tên / màu nhãn) rồi tag AI; tối đa `max`. */
export function usePickerSuggestions(text: string, enabled: boolean, max = 6) {
  const scopes = useSearchScopes(enabled);
  const allTags = useTagOptions(enabled);
  const tags = useMemo(() => {
    const labels = allTags.filter((o) => o.label).slice(0, CHIP_LABELS);
    return [...allTags.filter((o) => !o.label), ...labels];
  }, [allTags]);
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = normalize(text);
    if (!q || (q.length < 2 && !/[぀-鿿]/.test(q))) return [];
    const fromScopes = suggestScopes(text, scopes, max)
      .filter((s) => !s.disabled)
      .map((scope) => ({ lens: { kind: "scope", scope } as Lens, key: scope.key }));
    const fromTags = allTags
      .filter((tag) => tag.aliases.some((a) => startsWord(a, q)))
      .map((tag) => ({ lens: { kind: "tag", tag: tag.tag, name: tag.name } as Lens, key: `tag:${tag.tag}` }));
    return [...fromScopes, ...fromTags].slice(0, max);
  }, [text, scopes, allTags, max]);
  return { suggestions, scopes, tags };
}
