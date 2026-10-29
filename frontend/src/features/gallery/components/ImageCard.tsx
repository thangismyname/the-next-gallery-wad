import React, { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Media } from "../../../types";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format";
import { Check, Video } from "lucide-react";

/** Các trường card thực sự dùng — cả Media (gallery) lẫn TrashItem đều khớp. */
type CardMedia = Pick<
  Media,
  | "id"
  | "mediaType"
  | "title"
  | "url"
  | "thumbnailUrl"
  | "thumbnailUrlLarge"
  | "aiTags"
  | "durationSeconds"
> & { width?: number; height?: number };

interface ImageCardProps<T extends CardMedia> {
  media: T;
  onClick?: (media: T) => void;
  className?: string;
  selected?: boolean;
  onToggle?: (media: T) => void;
  onLongPress?: (media: T) => void;
  /** Nút hành động hiện khi hover, dưới tiêu đề (vd. Khôi phục / Xóa ở thùng rác). */
  actions?: React.ReactNode;
  /** Luôn hiện ở góc dưới-trái (vd chấm nhãn ở trang Yêu thích). */
  badge?: React.ReactNode;
  /** Thuộc tính `sizes` của ảnh theo bề rộng ô thật (vd "20vw" cho lưới 5 cột). */
  sizes?: string;
}

function ImageCardInner<T extends CardMedia>({
  media,
  onClick,
  className,
  selected = false,
  onToggle,
  onLongPress,
  actions,
  badge,
  sizes: sizesProp,
}: ImageCardProps<T>) {
  const { t } = useTranslation();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const src = media.thumbnailUrl || media.url;
  const isVideo = media.mediaType === "video";

  const longPressRef = useRef<{ timer: number | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!onLongPress) return;
    longPressRef.current.fired = false;
    longPressRef.current.timer = window.setTimeout(() => {
      longPressRef.current.fired = true;
      onLongPress(media);
    }, 450);
  };

  const clearLongPress = () => {
    if (longPressRef.current.timer !== null) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const handleClick = () => {
    if (longPressRef.current.fired) {
      longPressRef.current.fired = false;
      return;
    }
    if (selected || onToggle) {
      onToggle?.(media);
    } else {
      onClick?.(media);
    }
  };

  // srcSet 1 cỡ (bản nhỏ cho grid); nếu có bản lớn thì thêm mốc cho 2x/retina
  const srcSet =
    media.thumbnailUrlLarge && media.thumbnailUrl
      ? `${media.thumbnailUrl} 200w, ${media.thumbnailUrlLarge} 400w`
      : undefined;
  const sizes = srcSet
    ? (sizesProp ?? "(min-width: 1024px) 20vw, 33vw")
    : undefined;
  const selectable = Boolean(onToggle) || selected;

  // Bàn phím: Enter / Space = bấm (mở ảnh hoặc chọn khi đang ở chế độ chọn).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      // Lightbox tìm ô này để phóng ảnh ra từ đúng vị trí (và thu về khi đóng).
      data-media-id={media.id}
      aria-label={media.title || t("gallery.photo")}
      aria-pressed={selectable ? selected : undefined}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(e) => {
        if (onLongPress) {
          e.preventDefault();
          onLongPress(media);
        }
      }}
      className={cn(
        "group relative aspect-square overflow-hidden cursor-pointer",
        "border-border/40 bg-muted/30 select-none",
        "transition-all duration-300 hover:shadow-md hover:shadow-primary/5 hover:border-primary/30 active:scale-[0.97] active:duration-100",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected &&
          "border-primary ring-2 ring-primary/60 shadow-lg shadow-primary/20",
        className,
      )}
    >
      <CardContent className="p-0 absolute inset-0">
        {/* Skeleton Shimmer khi ảnh đang tải */}
        {!isLoaded && !hasError && src && (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none bg-muted/60" />
        )}

        {src && !hasError ? (
          <img
            src={src}
            srcSet={srcSet}
            sizes={sizes}
            alt={media.title || "Gallery photo"}
            width={media.width || 200}
            height={media.height || 200}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover object-center block",
              "transition-[opacity,scale] duration-300 group-hover:scale-[1.03]",
              isLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted/50">
            {hasError ? t("gallery.imageLoadError") : t("gallery.noImage")}
          </div>
        )}

        {/* Video Badge (+ thời lượng) */}
        {isVideo && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 p-1 text-white backdrop-blur-xs">
            <Video className="w-3.5 h-3.5" />
            {formatDuration(media.durationSeconds) && (
              <span className="pr-0.5 text-[10px] leading-none font-medium tabular-nums">
                {formatDuration(media.durationSeconds)}
              </span>
            )}
          </div>
        )}

        {badge && (
          <div className="pointer-events-none absolute bottom-2 left-2 transition-opacity group-hover:opacity-0">
            {badge}
          </div>
        )}

        {/* Selection Overlay */}
        {selected && (
          <div className="pointer-events-none absolute inset-0 animate-in bg-primary/10 fade-in-0 duration-150">
            <div className="absolute top-2 left-2 flex h-6 w-6 animate-in zoom-in-50 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md duration-200">
              <Check className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Hover Overlay Thông tin */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-end p-2.5 pointer-events-none",
            "bg-linear-to-t from-black/80 via-black/30 to-transparent",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          )}
        >
          <p className="text-xs font-medium text-white truncate">
            {media.title}
          </p>
          {(media.aiTags?.length ?? 0) > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {media.aiTags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-xs"
                >
                  {t(`studio.tags.${tag}`, { defaultValue: tag })}
                </span>
              ))}
            </div>
          )}
          {actions && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto mt-1.5 flex items-center gap-1.5"
            >
              {actions}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const ImageCard = memo(ImageCardInner) as typeof ImageCardInner;
