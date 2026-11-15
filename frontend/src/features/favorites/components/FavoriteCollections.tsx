import { savedQueryKey } from "@tng/shared";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Heart, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CoverCard } from "@/features/albums/components/CoverCard";
import { fetchSaved } from "@/services/labels";
import { cn } from "@/lib/utils";
import { TRASH_PATH } from "@/features/trash/trashPath";
import { useTrashSummary } from "@/features/trash/useTrashSummary";
import { favoritesPath } from "../favoritesPath";
import { LABEL_DOT } from "../labelColors";
import { useLabels } from "../useLabels";
import { useLabelManager } from "../useLabelManager";

/**
 * Mục "Bộ sưu tập" đầu trang Albums (giống tab Albums của app mobile): thẻ Yêu thích
 * (thả tim HOẶC có nhãn) + 1 thẻ / nhãn cá nhân → trang Yêu thích đã lọc theo nhãn đó
 * + thẻ Thùng rác cuối cùng (→ /albums/trash, như app mobile).
 */
export const FavoriteCollections: React.FC<{ gridClassName: string }> = ({ gridClassName }) => {
  const { t } = useTranslation();
  const { labels, totals } = useLabels();
  const openManager = useLabelManager((s) => s.setOpen);
  // Bìa thẻ Yêu thích = ảnh mới nhất (cùng tiền tố cache ["favorites"] → tự làm mới khi thả tim / gắn nhãn).
  const cover = useQuery({
    queryKey: [...savedQueryKey("all"), "cover"],
    queryFn: () => fetchSaved("all", 0, 1),
    staleTime: 30_000,
  });
  const first = cover.data?.items[0];
  const trash = useTrashSummary();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Heart className="size-4 text-rose-500" />
          {t("albums.collections")}
          <span className="font-normal text-muted-foreground">({labels.length + 2})</span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openManager(true)}
          className="h-8 text-xs text-muted-foreground"
        >
          <Settings2 className="size-3.5" />
          {t("favorites.labels.manage")}
        </Button>
      </div>
      <div className={gridClassName}>
        <CoverCard
          to={favoritesPath()}
          title={t("favorites.title")}
          subtitle={t("albums.photoCount", { n: totals.all })}
          coverUrl={first?.thumbnailUrlLarge ?? first?.thumbnailUrl ?? null}
          icon={Heart}
          iconClassName="text-rose-500/60"
          leading={<Heart className="size-3.5 shrink-0 fill-current text-rose-500" />}
        />
        {labels.map((label) => (
          <CoverCard
            key={label.id}
            to={favoritesPath(label.id)}
            title={label.name}
            subtitle={t("albums.photoCount", { n: label.count })}
            coverUrl={label.coverUrl}
            icon={Bookmark}
            leading={<span className={cn("size-2 shrink-0 rounded-full", LABEL_DOT[label.color])} />}
          />
        ))}
        <CoverCard
          to={TRASH_PATH}
          title={t("trash.title")}
          subtitle={t("albums.photoCount", { n: trash.count })}
          coverUrl={trash.coverUrl}
          icon={Trash2}
          leading={<Trash2 className="size-3.5 shrink-0 text-muted-foreground" />}
        />
      </div>
    </section>
  );
};
