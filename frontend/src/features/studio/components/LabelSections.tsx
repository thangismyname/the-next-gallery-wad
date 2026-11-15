import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { normalize } from "@/features/search/searchScope";
import { fetchTagSummary } from "@/services/media";
import { SECTION_ICONS } from "../tagCatalog";
import { tagColor, tagSummaryQueryKey } from "@tng/shared";
import { TAG_CHIP } from "@/lib/aiColors";
import { useTagCatalog } from "../useTagCatalog";


/**
 * 174 nhãn chi tiết (Open Images) chia theo 15 nhóm — chip "tên · số ảnh", bấm để
 * mở như 1 tag. Mặc định ẩn nhãn chưa có ảnh nào đạt ngưỡng; ô lọc tìm theo tên
 * ở ngôn ngữ đang dùng lẫn tiếng Anh, không cần dấu.
 */
export const LabelSections: React.FC<{ onOpen: (tag: string) => void }> = ({ onOpen }) => {
  const { t } = useTranslation();
  const catalog = useTagCatalog();
  const { data: summary = [] } = useQuery({
    queryKey: tagSummaryQueryKey,
    queryFn: fetchTagSummary,
    staleTime: 30_000,
  });
  const [filter, setFilter] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const counts = useMemo(() => new Map(summary.map((s) => [s.tag, s.count])), [summary]);
  const needle = normalize(filter.trim());

  const groups = useMemo(
    () =>
      catalog.sections
        .map((section) => ({
          section,
          labels: catalog.labels
            .filter((l) => l.section === section)
            .map((l) => ({ ...l, name: catalog.labelName(l), count: counts.get(l.id) ?? 0 }))
            .filter((l) => showEmpty || needle || l.count > 0)
            .filter((l) => !needle || normalize(l.name).includes(needle) || normalize(l.names.en).includes(needle))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.labels.length > 0),
    [catalog, counts, needle, showEmpty],
  );

  if (catalog.isPending) {
    return <Skeleton className="h-40 rounded-xl bg-muted/40" />;
  }
  if (catalog.labels.length === 0) return null; // ai-service chưa có probe nhãn chi tiết

  const model = catalog.labelModel;
  const total = catalog.labels.filter((l) => (counts.get(l.id) ?? 0) > 0).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("studio.labels.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("studio.labels.desc", { n: catalog.labels.length, used: total })}
            {model?.precision != null &&
              ` · ${t("studio.labels.precision", { pct: Math.round(model.precision * 100) })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("studio.labels.filter")}
              className="h-8 w-44 pl-8 text-sm"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowEmpty((v) => !v)}>
            {showEmpty ? t("studio.labels.hideEmpty") : t("studio.labels.showAll")}
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {needle ? t("studio.labels.noMatch") : t("studio.labels.none")}
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
          {groups.map(({ section, labels }) => {
            const Icon = SECTION_ICONS[section] ?? Tag;
            const color = tagColor("", section);
            return (
              <div key={section} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="size-3.5" />
                  {t(`studio.sections.${section}`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => onOpen(l.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-[filter,background-color] focus-visible:outline-2 focus-visible:outline-primary",
                        // Có ảnh → màu của nhóm (giống chip trong Lightbox); trống → xám.
                        l.count > 0
                          ? cn("border-transparent hover:brightness-95 dark:hover:brightness-125", TAG_CHIP[color])
                          : "border-border/60 bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {l.name}
                      <span className="tabular-nums opacity-60">{l.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
