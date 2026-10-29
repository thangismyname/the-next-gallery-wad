import React from "react";
import { useTranslation } from "react-i18next";
import { X, Share2, Download, Trash2, Heart, FolderPlus, Bookmark } from "lucide-react";

import { useSelectionStore } from "@/hooks/useSelectionStore";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { cn } from "@/lib/utils";
import { LabelMenu } from "@/features/favorites/components/LabelMenu";

interface SelectionActionBarProps {
  onShare: (ids: string[]) => void;
  onDownload: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onFavorite: (ids: string[]) => void;
  className?: string;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  onShare,
  onDownload,
  onDelete,
  onFavorite,
  className,
}) => {
  const { t } = useTranslation();
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const openAddToAlbum = useGalleryActionsStore((s) => s.openAddToAlbum);
  const ids = Array.from(selectedIds);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 p-1.5 pl-3",
        "glass rounded-full",
        className,
      )}
    >
      <button
        onClick={clear}
        className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95"
        aria-label={t("selection.cancel")}
      >
        <X className="h-4 w-4" />
      </button>

      <span className="px-2 text-xs font-medium text-muted-foreground">
        {t("selection.count", { count: ids.length })}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onFavorite(ids)}
          className="flex items-center justify-center rounded-full p-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95"
          aria-label={t("selection.favorite")}
        >
          <Heart className="h-4 w-4" />
        </button>
        <LabelMenu mediaIds={ids}>
          <button
            className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95"
            aria-label={t("favorites.labels.add")}
            title={t("favorites.labels.add")}
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </LabelMenu>
        <button
          onClick={() => openAddToAlbum(ids)}
          className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95"
          aria-label={t("albums.addTo")}
          title={t("albums.addTo")}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
        <button
          onClick={() => onShare(ids)}
          className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95"
          aria-label={t("selection.share")}
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDownload(ids)}
          className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-95"
          aria-label={t("selection.download")}
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(ids)}
          className="flex items-center justify-center rounded-full p-2 text-destructive hover:bg-destructive/10 active:scale-95"
          aria-label={t("selection.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
