import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import {
  albumsContainingQueryKey,
  fetchAlbumsContaining,
} from "@/services/albums";

type Props = { mediaId: string; active: boolean };

/**
 * Lightbox → Chi tiết: ảnh đang nằm trong những album nào (album thường mình
 * xem được). Không có album / chưa đăng nhập (link công khai) → ẩn.
 */
export const MediaAlbumsSection: React.FC<Props> = ({ mediaId, active }) => {
  const { t } = useTranslation();
  const { data: albums = [] } = useQuery({
    queryKey: albumsContainingQueryKey(mediaId),
    queryFn: () => fetchAlbumsContaining(mediaId),
    enabled: active,
    retry: false,
    staleTime: 30_000,
  });
  if (albums.length === 0) return null;

  return (
    <div className="border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <FolderOpen size={13} className="text-white/40" />
        <p className="text-[11px] tracking-wide text-white/40 uppercase">
          {t("albums.inAlbums")}
        </p>
      </div>
      <div className="space-y-1">
        {albums.map((album) => (
          <Link
            key={album.id}
            to={`/albums/${album.id}`}
            className="flex items-center gap-2 rounded-lg p-1 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <span className="size-8 shrink-0 overflow-hidden rounded-md bg-white/10">
              {album.coverUrl && (
                <img
                  src={album.coverUrl}
                  alt=""
                  className="size-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{album.name}</span>
            <span className="text-xs text-white/40">{album.mediaCount}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};
