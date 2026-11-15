import { type MediaListItem, type FriendSearchResult } from "@tng/shared";
import { useTranslation } from "react-i18next";
import { Boxes, FolderOpen, Image, Sparkles, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AI_BAR } from "@/lib/aiColors";
import { cn } from "@/lib/utils";
import { describeScoreParts, presentScoreParts, SCORE_SOURCE } from "../searchScore";
import type { SpotlightResults } from "../useSpotlightSearch";

/** Tiêu đề 1 nhóm kết quả: icon + tên (số lượng) + hành động tuỳ chọn. */
const GroupHeader: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div className="mb-2 flex items-center gap-2 px-1">
    {icon}
    <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">{title}</span>
    {children}
  </div>
);

const ThumbButton: React.FC<{
  item: MediaListItem;
  onClick: () => void;
  title?: string;
  children?: React.ReactNode;
}> = ({ item, onClick, title, children }) => (
  <button
    className="group relative aspect-square overflow-hidden rounded-md focus:ring-2 focus:ring-ring focus:outline-none"
    data-media-id={item.id}
    onClick={onClick}
    title={title}
  >
    <img
      src={item.thumbnailUrl}
      alt={item.title ?? ""}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
    {children}
  </button>
);

type Props = {
  results: SpotlightResults;
  /** Tên phạm vi đang tìm trong (null = cả thư viện). */
  scopeName: string | null;
  onFriend: (friend: FriendSearchResult) => void;
  onAlbum: (albumId: string) => void;
  onMedia: (list: MediaListItem[], item: MediaListItem) => void;
  /** Lưu câu đang tìm thành album thông minh (chỉ khi không có phạm vi). */
  onSaveQuery?: () => void;
};

/** 4 nhóm kết quả Spotlight: bạn bè · album · ảnh (search kết hợp) · vật thể (YOLO). */
export const SearchResults: React.FC<Props> = ({ results, scopeName, onFriend, onAlbum, onMedia, onSaveQuery }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {results.friends.length > 0 && (
        <div>
          <GroupHeader
            icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
            title={`${t("search.friendResults")} (${results.friends.length})`}
          />
          <div className="space-y-1">
            {results.friends.map((item) => {
              const isFriend = item.relationship === "friends";
              return (
                <button
                  key={item.id}
                  onClick={() => onFriend(item)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/50"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={item.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">{item.name?.charAt(0)?.toUpperCase() ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.email}</div>
                  </div>
                  <span className="shrink-0 text-xs text-primary">
                    {isFriend ? t("search.sendToFriend") : t(`friends.relation.${item.relationship}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {results.albums.length > 0 && (
        <div>
          <GroupHeader
            icon={<FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />}
            title={`${t("search.albumResults")} (${results.albums.length})`}
          />
          <div className="space-y-1">
            {results.albums.map((album) => (
              <button
                key={album.id}
                type="button"
                onClick={() => onAlbum(album.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/50"
              >
                {album.coverUrl ? (
                  <img src={album.coverUrl} alt={album.name} className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{album.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {album.mediaCount} {t("search.photos")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {results.media.length > 0 && (
        <div>
          <GroupHeader
            icon={<Image className="h-3.5 w-3.5 text-sky-500" />}
            title={`${scopeName ? t("search.scope.results", { name: scopeName }) : t("search.mediaResults")} (${results.media.length})`}
          >
            {onSaveQuery && (
              <button
                type="button"
                onClick={onSaveQuery}
                className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-3 w-3" />
                {t("albums.saveSearch")}
              </button>
            )}
          </GroupHeader>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results.media.map((item) => (
              <ThumbButton
                key={item.id}
                item={item}
                onClick={() => onMedia(results.media, item)}
                title={describeScoreParts(item.scoreParts)}
              >
                {typeof item.score === "number" && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {Math.round(item.score * 100)}%
                  </span>
                )}
                {/* Nguồn góp điểm (CLIP / Tag / YOLO) — chi tiết ở tooltip */}
                {item.scoreParts && (
                  <span className="absolute top-1 right-1 flex gap-0.5 rounded-full bg-black/50 p-1">
                    {presentScoreParts(item.scoreParts).map((k) => (
                      <span key={k} className={cn("size-1.5 rounded-full", AI_BAR[SCORE_SOURCE[k]])} />
                    ))}
                  </span>
                )}
              </ThumbButton>
            ))}
          </div>
        </div>
      )}

      {results.objects.length > 0 && (
        <div>
          <GroupHeader
            icon={<Boxes className="h-3.5 w-3.5 text-emerald-500" />}
            title={`${t("search.objectResults")} (${results.objects.length})`}
          />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {results.objects.map((item) => (
              <ThumbButton key={item.id} item={item} onClick={() => onMedia(results.objects, item)}>
                {typeof item.score === "number" && (
                  <span className="absolute bottom-1 left-1 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-medium text-black">
                    {Math.round(item.score * 100)}%
                  </span>
                )}
              </ThumbButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
