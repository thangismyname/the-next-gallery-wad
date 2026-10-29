import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Images,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Unlink,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Album } from "@/services/albums";

export type AlbumAction =
  "add" | "share" | "edit" | "convert" | "leave" | "delete";

type Props = { album: Album; onAction: (action: AlbumAction) => void };

/** Đầu trang album: bìa, tên, mô tả, truy vấn (album thông minh), thao tác. */
export const AlbumHeader: React.FC<Props> = ({ album, onAction }) => {
  const { t } = useTranslation();
  const isOwner = album.role === "owner";
  const canAdd =
    album.kind === "manual" && (isOwner || album.role === "editor");
  const rule = album.smartRule;

  return (
    <div className="mb-6 space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/albums">
          <ArrowLeft className="size-4" />
          {t("albums.title")}
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-36">
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <Images className="absolute top-1/2 left-1/2 size-10 -translate-1/2 text-muted-foreground/40" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {album.kind === "smart" && (
              <Badge className="gap-1">
                <Sparkles className="size-3" />
                {t("albums.smartBadge")}
              </Badge>
            )}
            {!isOwner && (
              <Badge variant="secondary">
                {t("albums.sharedBy", {
                  name: album.owner.name ?? "",
                  role: t(`albums.roles.${album.role}`),
                })}
              </Badge>
            )}
          </div>
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {album.name}
          </h1>
          {album.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {album.description}
            </p>
          )}
          {rule && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {t("albums.smart.rule")}:
              {rule.type === "tags" ? (
                rule.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[11px]">
                    {t(`studio.tags.${tag}`)}
                  </Badge>
                ))
              ) : (
                <span className="font-medium text-foreground">
                  “{rule.query}”
                </span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("albums.photoCount", { n: album.mediaCount })}
            {album.memberCount > 0 &&
              ` · ${t("albums.memberCount", { n: album.memberCount + 1 })}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canAdd && (
            <Button onClick={() => onAction("add")}>
              <Plus className="size-4" />
              {t("albums.addPhotos")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onAction("share")}>
            {isOwner ? (
              <Share2 className="size-4" />
            ) : (
              <Users className="size-4" />
            )}
            {isOwner ? t("albums.share") : t("albums.members")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("albums.more")}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwner && (
                <DropdownMenuItem onClick={() => onAction("edit")}>
                  <Pencil className="size-4" />
                  {t("albums.edit")}
                </DropdownMenuItem>
              )}
              {isOwner && album.kind === "smart" && (
                <DropdownMenuItem onClick={() => onAction("convert")}>
                  <Unlink className="size-4" />
                  {t("albums.convert")}
                </DropdownMenuItem>
              )}
              {!isOwner && (
                <DropdownMenuItem onClick={() => onAction("leave")}>
                  <LogOut className="size-4" />
                  {t("albums.leave")}
                </DropdownMenuItem>
              )}
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onAction("delete")}
                  >
                    <Trash2 className="size-4" />
                    {t("albums.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
