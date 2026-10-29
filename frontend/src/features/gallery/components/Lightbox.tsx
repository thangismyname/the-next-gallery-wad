import React, { useEffect, useCallback, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Heart,
  Info,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  Maximize2,
  FolderPlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Media } from "../../../types";
import { MediaListItem, toMedia, downloadUrl } from "@/services/media";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/utils/format";
import { MediaDetailsPanel } from "./MediaDetailsPanel";
import LightboxFilmstrip from "./LightboxFilmstrip";
import { DetectionOverlay } from "./DetectionOverlay";
import { useLightboxZoom } from "@/hooks/useLightboxZoom";
import { useLightboxTransition } from "@/hooks/useLightboxTransition";
import { useProgressiveImage } from "@/hooks/useProgressiveImage";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useMediaDetections } from "@/hooks/useMediaDetections";

interface LightboxProps {
  media: Media;
  mediaList: Media[];
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSelect?: (index: number) => void;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  /** Mở hộp thoại "Thêm vào album" cho ảnh đang xem. */
  onAddToAlbum?: () => void;
  /** Nút "Tải bản gốc" (ẩn ở Thùng rác / link công khai — có nút riêng). */
  canDownload?: boolean;
}

export const Lightbox: React.FC<LightboxProps> = ({
  media: mediaProp,
  mediaList,
  onClose,
  onPrev,
  onNext,
  onSelect,
  onToggleFavorite,
  onDelete,
  onAddToAlbum,
  canDownload = true,
}) => {
  const { t } = useTranslation();
  // Ảnh mở từ mục "Ảnh tương tự" mà không nằm trong mediaList → xem tạm tại
  // chỗ (peek). Favorite/Delete ẩn khi peek vì callback của parent gắn với
  // ảnh gốc; Esc / prev / next quay về luồng bình thường.
  const [peek, setPeek] = useState<Media | null>(null);
  const media = peek ?? mediaProp;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isVideo = media.mediaType === "video";


  // Developer Mode: vẽ bounding box YOLO lên ảnh
  const { devModeEnabled } = useDeveloperMode();
  const showOverlay = devModeEnabled && !isVideo;
  const { detections } = useMediaDetections(showOverlay ? media.id : null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgRect, setImgRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Zoom & pan (category của lightbox)
  const {
    view,
    isPanning,
    imgAreaRef,
    zoomStep,
    resetZoom,
    handleDoubleClick,
    onImgPointerDown,
    onImgPointerMove,
    onImgPointerUp,
  } = useLightboxZoom({ isVideo, resetKey: media.id });

  // Phóng ra từ ô ảnh trong lưới khi mở, thu về khi đóng (hooks/useLightboxTransition).
  const { scope, requestClose } = useLightboxTransition({
    areaRef: imgAreaRef,
    openId: mediaProp.id,
    currentId: media.id,
    onClose,
  });

  // 3 tầng ảnh med → display → gốc (hooks/useProgressiveImage).
  const {
    imageSrc,
    displaySrc,
    originalSrc,
    displayLoaded,
    fullLoaded,
    hasDisplay,
    needOriginal,
    requestOriginal,
    onDisplayLoad,
    onDisplayError,
    onFullLoad,
  } = useProgressiveImage(media, { zoomed: view.zoom > 1 });

  const toggleDetails = () => setDetailsOpen((prev) => !prev);

  const currentIndex = mediaList.findIndex((m) => m.id === mediaProp.id);

  useEffect(() => {
    setPeek(null);
  }, [mediaProp.id]);

  const goPrev = onPrev
    ? () => {
        setPeek(null);
        onPrev();
      }
    : undefined;
  const goNext = onNext
    ? () => {
        setPeek(null);
        onNext();
      }
    : undefined;
  const handleSelect = onSelect
    ? (index: number) => {
        setPeek(null);
        onSelect(index);
      }
    : undefined;

  const openSimilar = (item: MediaListItem) => {
    const index = mediaList.findIndex((m) => m.id === item.id);
    if (index !== -1 && onSelect) {
      setPeek(null);
      onSelect(index);
    } else {
      setPeek(toMedia(item));
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (peek) setPeek(null);
        else void requestClose();
      }
      if (e.key === "ArrowLeft" && onPrev) {
        setPeek(null);
        onPrev();
      }
      if (e.key === "ArrowRight" && onNext) {
        setPeek(null);
        onNext();
      }
      if (e.key === "+" || e.key === "=") zoomStep(1.25);
      if (e.key === "-") zoomStep(1 / 1.25);
      if (e.key === "0") resetZoom();
    },
    [peek, requestClose, onPrev, onNext, zoomStep, resetZoom],
  );

  // Đo vùng ảnh đang hiển thị để đặt overlay bbox đúng vị trí (object-contain).
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !showOverlay) {
      setImgRect(null);
      return;
    }
    const update = () => {
      setImgRect({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [showOverlay, media.id, displayLoaded, fullLoaded, view.zoom]);

  // Preload BẢN DISPLAY của ảnh kề (trái/phải) để chuyển ảnh không bị delay —
  // không bao giờ preload file gốc.
  useEffect(() => {
    if (mediaList.length === 0) return;
    const idx = mediaList.findIndex((m) => m.id === media.id);
    if (idx === -1) return;
    const adjacent = [
      mediaList[(idx + 1) % mediaList.length],
      mediaList[(idx - 1 + mediaList.length) % mediaList.length],
    ];
    adjacent.forEach((m) => {
      if (m.mediaType === "video" || !m.displayUrl) return;
      const img = new Image();
      img.src = m.displayUrl;
    });
  }, [media.id, mediaList]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // ======= Filmstrip auto-hide (hiện khi tương tác, ẩn sau ~3s idle) =======
  const [filmstripVisible, setFilmstripVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const showFilmstrip = useCallback(() => {
    if (mediaList.length <= 1) return;
    setFilmstripVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => setFilmstripVisible(false),
      3000,
    );
  }, [mediaList.length]);

  useEffect(() => {
    showFilmstrip();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [showFilmstrip]);

  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div
      ref={scope}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col select-none backdrop-blur-xs"
      onClick={() => void requestClose()}
      onPointerMove={showFilmstrip}
      onPointerDown={showFilmstrip}
    >
      {/* ======= Main content: [Image | Panel] (chỉ mobile panel nằm dưới) ======= */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Image area */}
        <div
          ref={imgAreaRef}
          className="flex-1 relative flex items-center justify-center min-w-0 min-h-0 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: view.zoom > 1 ? "grab" : "default" }}
        >
          {/* Header actions — neo theo vùng ảnh, không đè lên detail panel */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2 z-50"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {!isVideo && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomStep(1 / 1.25);
                  }}
                  className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                  aria-label={t("lightbox.zoomOut")}
                  title={t("lightbox.zoomOut")}
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    resetZoom();
                  }}
                  className="w-12 text-center text-xs tabular-nums text-white/70 hover:text-white py-1 rounded-full hover:bg-white/10 transition"
                  aria-label={t("lightbox.resetZoom")}
                  title={t("lightbox.resetZoom")}
                >
                  {Math.round(view.zoom * 100)}%
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    zoomStep(1.25);
                  }}
                  className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                  aria-label={t("lightbox.zoomIn")}
                  title={t("lightbox.zoomIn")}
                >
                  <ZoomIn size={20} />
                </button>
                {view.zoom > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      resetZoom();
                    }}
                    className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                    aria-label={t("lightbox.resetZoom")}
                    title={t("lightbox.resetZoom")}
                  >
                    <RotateCcw size={18} />
                  </button>
                )}
              </div>
            )}
            {hasDisplay && !needOriginal && !fullLoaded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  requestOriginal();
                }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                title={t("lightbox.viewOriginal")}
              >
                <Maximize2 size={14} />
                {t("lightbox.viewOriginal")}
                {media.sizeBytes ? (
                  <span className="text-white/50">
                    {formatBytes(media.sizeBytes)}
                  </span>
                ) : null}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleDetails();
              }}
              className={cn(
                "text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition",
                detailsOpen && "text-white bg-white/15",
              )}
              aria-label={t("lightbox.detail")}
              aria-pressed={detailsOpen}
            >
              <Info size={24} />
            </button>
            {onToggleFavorite && !peek && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                className={cn(
                  "text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition",
                  media.isFavorite && "text-rose-400",
                )}
                aria-label={t("lightbox.favorite")}
              >
                <Heart
                  size={24}
                  className={media.isFavorite ? "fill-rose-400" : ""}
                />
              </button>
            )}
            {onAddToAlbum && !peek && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToAlbum();
                }}
                className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                aria-label={t("albums.addTo")}
                title={t("albums.addTo")}
              >
                <FolderPlus size={24} />
              </button>
            )}
            {canDownload && media.url && (
              <a
                href={downloadUrl(media.url)}
                onClick={(e) => e.stopPropagation()}
                className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                aria-label={t("lightbox.download")}
                title={t("lightbox.download")}
              >
                <Download size={24} />
              </a>
            )}
            {onDelete && !peek && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
                aria-label={t("lightbox.delete")}
                title={t("lightbox.delete")}
              >
                <Trash2 size={24} />
              </button>
            )}
            <button
              onClick={() => void requestClose()}
              className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
              aria-label={t("lightbox.close")}
            >
              <X size={26} />
            </button>
          </div>

          {/* Prev */}
          {goPrev && currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition z-10"
              aria-label={t("lightbox.prev")}
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* Loading spinner — chờ bản display */}
          {!displayLoaded && !isVideo && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 animate-spin text-white/50" />
            </div>
          )}

          {/* Đang tải file gốc (đã có bản display hiển thị bên dưới) */}
          {displayLoaded && needOriginal && !fullLoaded && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white/80">
              <Loader2 className="size-3.5 animate-spin" />
              {t("lightbox.loadingOriginal")}
            </div>
          )}

          {isVideo ? (
            <video
              src={media.url}
              // Poster hiện ngay; trình duyệt chỉ tải đoạn đầu (Range) để phát.
              poster={media.displayUrl ?? undefined}
              preload="metadata"
              controls
              autoPlay
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <>
              {/* Loader ẩn — báo hiệu khi từng tầng tải xong rồi mới đổi src */}
              {!displayLoaded && (
                <img
                  src={displaySrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  onLoad={onDisplayLoad}
                  onError={onDisplayError}
                  className="hidden"
                />
              )}
              {needOriginal && !fullLoaded && (
                <img
                  src={originalSrc}
                  alt=""
                  aria-hidden
                  draggable={false}
                  onLoad={onFullLoad}
                  className="hidden"
                />
              )}

              {/* Chỉ hiện ĐÚNG 1 ảnh: tầng tốt nhất đã tải xong */}
              <div
                onPointerDown={onImgPointerDown}
                onPointerMove={onImgPointerMove}
                onPointerUp={onImgPointerUp}
                onPointerCancel={onImgPointerUp}
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  view.zoom > 1 &&
                    (isPanning ? "cursor-grabbing" : "cursor-grab"),
                )}
                style={{ touchAction: view.zoom > 1 ? "none" : "pan-y" }}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt={media.title || "Gallery photo"}
                  draggable={false}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-2xl opacity-100 select-none transition-transform duration-150 ease-out"
                  style={{
                    transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
                    willChange: "transform",
                  }}
                />
                {showOverlay && view.zoom === 1 && imgRect && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: imgRect.left,
                      top: imgRect.top,
                      width: imgRect.width,
                      height: imgRect.height,
                    }}
                  >
                    <DetectionOverlay detections={detections} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Next */}
          {goNext && currentIndex < mediaList.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition z-10"
              aria-label={t("lightbox.next")}
            >
              <ChevronRight size={36} />
            </button>
          )}
        </div>

        {/* Detail panel — mobile: full width dưới ảnh; từ tablet: w-80 bên phải */}
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[width,height] duration-300 ease-out",
            detailsOpen
              ? "w-full h-2/5 md:w-80 md:h-full md:shrink-0"
              : "w-0 h-0 md:w-0 md:h-full md:shrink-0",
          )}
        >
          <MediaDetailsPanel
            media={media}
            active={detailsOpen}
            onSelectSimilar={openSimilar}
          />
        </div>
      </div>

      {/* Filmstrip — nằm trong layout (không đè ảnh), auto-hide khi idle */}
      {mediaList.length > 1 && (
        <LightboxFilmstrip
          mediaList={mediaList}
          activeIndex={activeIndex}
          currentIndex={currentIndex}
          visible={filmstripVisible}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
};
