import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, Images, Sparkles, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Album } from "@/services/albums";

type Props = {
  album: Album;
  /** Lời mời: hiện nút nhận / từ chối thay vì mở album. */
  onRespond?: (album: Album, accept: boolean) => void;
  responding?: boolean;
};

/** Thẻ album: ảnh bìa + tên + số ảnh + huy hiệu (thông minh / chung / vai trò). */
export const AlbumCard: React.FC<Props> = ({
  album,
  onRespond,
  responding,
}) => {
  const { t } = useTranslation();
  const invitation = album.pending && onRespond;

  const body = (
    <>
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
        <div className="absolute top-2 left-2 flex gap-1">
          {album.kind === "smart" && (
            <Badge className="gap-1 bg-primary/90">
              <Sparkles className="size-3" />
              {t("albums.smartBadge")}
            </Badge>
          )}
          {(album.memberCount > 0 || album.role !== "owner") && (
            <Badge
              variant="secondary"
              className="gap-1 bg-background/80 backdrop-blur"
            >
              <Users className="size-3" />
              {album.memberCount + 1}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-2 min-w-0 px-0.5">
        <p className="truncate text-sm font-medium">{album.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {album.role === "owner"
            ? t("albums.photoCount", { n: album.mediaCount })
            : t("albums.sharedBy", {
                name: album.owner.name ?? "",
                role: t(`albums.roles.${album.role}`),
              })}
        </p>
      </div>
    </>
  );

  if (invitation) {
    return (
      <div className="group">
        {body}
        <div className="mt-2 flex gap-1.5">
          <Button
            size="sm"
            className="flex-1"
            disabled={responding}
            onClick={() => onRespond(album, true)}
          >
            <Check className="size-4" />
            {t("albums.accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={responding}
            onClick={() => onRespond(album, false)}
            aria-label={t("albums.decline")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/albums/${album.id}`}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </Link>
  );
};
