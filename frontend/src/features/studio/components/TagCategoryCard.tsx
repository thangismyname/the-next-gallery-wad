import { useTranslation } from "react-i18next";
import type { TagSummary } from "@/services/media";
import { cn } from "@/lib/utils";
import { TAG_ICONS } from "../tagCatalog";

type Props = {
  tag: string;
  summary?: TagSummary;
  onOpen: (tag: string) => void;
};

/** 1 danh mục: ảnh bìa (ảnh chắc chắn nhất) + tên + số ảnh. */
export const TagCategoryCard: React.FC<Props> = ({ tag, summary, onOpen }) => {
  const { t } = useTranslation();
  const Icon = TAG_ICONS[tag];
  const count = summary?.count ?? 0;
  const cover = count > 0 ? summary?.coverUrl : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(tag)}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary",
        count === 0 && "opacity-60",
      )}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <Icon className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-muted-foreground/50" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4" />
          {t(`studio.tags.${tag}`)}
        </p>
        <p className="text-xs text-white/80">
          {t("studio.photoCount", { n: count })}
        </p>
      </div>
    </button>
  );
};
