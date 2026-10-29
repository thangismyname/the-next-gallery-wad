import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTagSummary, tagSummaryQueryKey } from "@/services/media";
import { TAG_GROUPS } from "../tagCatalog";
import { TagCategoryCard } from "./TagCategoryCard";

/** Lưới danh mục theo 3 nhóm (đối tượng / cảnh / thuộc tính). */
export const TagCategoryGrid: React.FC<{ onOpen: (tag: string) => void }> = ({
  onOpen,
}) => {
  const { t } = useTranslation();
  const {
    data = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: tagSummaryQueryKey,
    queryFn: fetchTagSummary,
    staleTime: 30_000,
  });
  const byTag = new Map(data.map((s) => [s.tag, s]));

  if (isError) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("studio.loadFailed")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {TAG_GROUPS.map(({ group, tags }) => (
        <section key={group} className="space-y-2.5">
          <div>
            <h2 className="text-sm font-semibold">
              {t(`studio.groups.${group}.title`)}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(`studio.groups.${group}.desc`)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {tags.map((tag) =>
              isPending ? (
                <Skeleton
                  key={tag}
                  className="aspect-[4/3] rounded-xl bg-muted/40"
                />
              ) : (
                <TagCategoryCard
                  key={tag}
                  tag={tag}
                  summary={byTag.get(tag)}
                  onOpen={onOpen}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
