import React, { useEffect, useCallback, useRef, useState } from "react";
import { LightboxVideo } from "./LightboxVideo";
import { ChevronLeft, ChevronRight, Loader2, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Media, MediaListItem, toMedia } from "@tng/shared";
import { downloadUrl } from "@/services/media";
import { cn } from "@/lib/utils";
import { MediaDetailsPanel } from "./MediaDetailsPanel";
import LightboxFilmstrip from "./LightboxFilmstrip";
import { DetectionOverlay } from "./DetectionOverlay";
import { useLightboxZoom } from "@/features/gallery/useLightboxZoom";
import { useLightboxTransition } from "@/features/gallery/useLightboxTransition";
import { useProgressiveImage } from "@/features/gallery/useProgressiveImage";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useMediaDetections } from "@/features/gallery/useMediaDetections";
import { useAutoHide, useElementRect, usePreloadAdjacent } from "@/features/gallery/useLightboxHelpers";
import { LightboxToolbar } from "./LightboxToolbar";
import { LightboxHint } from "./LightboxHint";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  /** Ảnh của chính mình (thư viện / yêu thích) → nút "Chỉnh sửa". */
  editable?: boolean;
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
  editable = false,
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
  // Live Photo: phát video đi kèm (bấm "LIVE"), hết thì về ảnh; đổi ảnh → dừng.
  const [livePlaying, setLivePlaying] = useState(false);
  useEffect(() => setLivePlaying(false), [media.id]);
  const { detections } = useMediaDetections(showOverlay ? media.id : null);
  const imgRef = useRef<HTMLImageElement | null>(null);

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

  // Phóng ra từ ô ảnh trong lưới khi mở, thu về khi đóng (../useLightboxTransition.ts).
  const { scope, requestClose } = useLightboxTransition({
    areaRef: imgAreaRef,
    openId: mediaProp.id,
    currentId: media.id,
    onClose,
  });

  // 3 tầng ảnh med → display → gốc (../useProgressiveImage.ts).
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

  const navigate = useNavigate();
  // Không chỉnh khi đang xem tạm ảnh tương tự (có thể không phải ảnh của mình).
  const canEdit = editable && !peek && !isVideo;
  const openEditor = useCallback(() => navigate(`/edit/${media.id}`), [navigate, media.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "e" && canEdit && !e.metaKey && !e.ctrlKey) openEditor();
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
    [peek, requestClose, onPrev, onNext, zoomStep, resetZoom, canEdit, openEditor],
  );

  // Đo vùng ảnh đang hiển thị để đặt overlay bbox đúng vị trí (object-contain).
  const imgRect = useElementRect(
    imgRef,
    showOverlay,
    `${media.id}|${displayLoaded}|${fullLoaded}|${view.zoom}`,
  );

  usePreloadAdjacent(media.id, mediaList);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Filmstrip: hiện khi tương tác, ẩn sau ~3s idle.
  const { visible: filmstripVisible, show: showFilmstrip } = useAutoHide(mediaList.length > 1);

  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    // Tooltip mô tả nút (LightboxHint): trễ 400ms để lướt chuột qua không bật liên tục.
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
    <div
      ref={scope}
      className="fixed inset-0 z-50 bg-background/95 text-foreground flex flex-col select-none backdrop-blur-xs"
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
          <LightboxToolbar
            isVideo={isVideo}
            zoom={view.zoom}
            onZoomStep={zoomStep}
            onResetZoom={resetZoom}
            viewOriginal={
              hasDisplay && !needOriginal && !fullLoaded && !media.editedAt
                ? { onClick: requestOriginal, sizeBytes: media.sizeBytes }
                : null
            }
            detailsOpen={detailsOpen}
            onToggleDetails={toggleDetails}
            // Xem tạm (peek) ảnh tương tự: ẩn hành động gắn với ảnh của parent.
            favorite={
              onToggleFavorite && !peek
                ? { active: Boolean(media.isFavorite), onToggle: onToggleFavorite }
                : undefined
            }
            onAddToAlbum={peek ? undefined : onAddToAlbum}
            onEdit={canEdit ? openEditor : undefined}
            downloadHref={canDownload && media.url ? downloadUrl(media.url) : undefined}
            onDelete={peek ? undefined : onDelete}
            onClose={() => void requestClose()}
          />

          {/* Prev */}
          {goPrev && currentIndex > 0 && (
            <LightboxHint label={t("lightbox.prev")} shortcut="←" side="right">
              <button
                onClick={goPrev}
                className="glass-soft absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full text-foreground/80 transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={t("lightbox.prev")}
              >
                <ChevronLeft size={24} />
              </button>
            </LightboxHint>
          )}

          {/* Loading spinner — chờ bản display */}
          {!displayLoaded && !isVideo && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 animate-spin text-foreground/50" />
            </div>
          )}

          {/* Đang tải file gốc (đã có bản display hiển thị bên dưới) */}
          {displayLoaded && needOriginal && !fullLoaded && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs text-foreground/80 shadow-lg backdrop-blur">
              <Loader2 className="size-3.5 animate-spin" />
              {t("lightbox.loadingOriginal")}
            </div>
          )}

          {isVideo ? (
            // key = media → mỗi video mount lại, áp âm lượng / tốc độ đã nhớ.
            <LightboxVideo key={media.id} src={media.url} poster={media.displayUrl ?? undefined} />
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
                // Ảnh tự xử lý mọi cử chỉ chạm (chụm 2 ngón, chạm đúp, kéo) → trình
                // duyệt không zoom cả trang / cuộn.
                style={{ touchAction: "none" }}
              >
                {livePlaying && media.motionUrl && (
                  <video
                    src={media.motionUrl}
                    autoPlay
                    playsInline
                    onEnded={() => setLivePlaying(false)}
                    onError={() => setLivePlaying(false)}
                    className="absolute max-h-full max-w-full object-contain rounded-lg"
                  />
                )}
                {media.motionUrl && view.zoom === 1 && (
                  <button
                    type="button"
                    onClick={() => setLivePlaying((v) => !v)}
                    className="glass-soft absolute top-4 left-4 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wider text-foreground/90 uppercase"
                    aria-pressed={livePlaying}
                  >
                    <Play className="size-3 fill-current" />
                    {t("lightbox.live")}
                  </button>
                )}
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
            <LightboxHint label={t("lightbox.next")} shortcut="→" side="left">
              <button
                onClick={goNext}
                className="glass-soft absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full text-foreground/80 transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={t("lightbox.next")}
              >
                <ChevronRight size={24} />
              </button>
            </LightboxHint>
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
    </TooltipProvider>
  );
};
