import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Heart,
  Image,
  Images,
  type LucideIcon,
  Smartphone,
  Video,
} from "lucide-react";
import type { AutoAlbum } from "@/services/albums";
import { autoAlbumName } from "../autoAlbums";

const TYPE_ICONS: Record<string, LucideIcon> = {
  "type-photos": Image,
  "type-videos": Video,
  "type-screenshots": Smartphone,
  "type-favorites": Heart,
};

/** Thẻ album tự động — cùng kiểu với AlbumCard (ô trong lưới). */
export const AutoAlbumCard: React.FC<{ album: AutoAlbum }> = ({ album }) => {
  const { t, i18n } = useTranslation();
  return (
    <Link
      to={`/albums/auto/${album.key}`}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-44"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted/50">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Images className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-muted-foreground/40" />
        )}
      </div>
      <div className="mt-2 min-w-0 px-0.5">
        <p className="truncate text-sm font-medium">
          {autoAlbumName(album, t, i18n.language)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t("albums.photoCount", { n: album.count })}
        </p>
      </div>
    </Link>
  );
};

/** Thẻ ngang gọn (bìa nhỏ + icon + tên + số ảnh) cho nhóm Loại media — xếp lưới. */
export const AutoAlbumTile: React.FC<{ album: AutoAlbum }> = ({ album }) => {
  const { t, i18n } = useTranslation();
  const Icon = TYPE_ICONS[album.key] ?? Images;
  return (
    <Link
      to={`/albums/auto/${album.key}`}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2 pr-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted/50">
        {album.coverUrl && (
          <img
            src={album.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="truncate">{autoAlbumName(album, t, i18n.language)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {t("albums.photoCount", { n: album.count })}
        </p>
      </div>
    </Link>
  );
};
