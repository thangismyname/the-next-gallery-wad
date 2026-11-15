import { useTranslation } from "react-i18next";
import {
  Download,
  FolderPlus,
  SlidersHorizontal,
  Heart,
  Info,
  Maximize2,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { formatBytes } from "@tng/shared";
import { cn } from "@/lib/utils";
import { LightboxHint } from "./LightboxHint";

// Nút nằm trong thanh `glass` (nền mờ + blur) → luôn đọc được dù ảnh phía sau
// cùng màu với icon. Màu theo theme.
const ICON_BUTTON =
  "grid size-9 place-items-center rounded-full text-foreground transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
/** 1 thanh nút nổi (bo tròn, nền mờ theo theme). */
const PILL = "glass-soft pointer-events-auto flex items-center gap-0.5 rounded-full p-1";

/** Bấm nút trong toolbar không được lan ra nền (nền bấm = đóng Lightbox). */
const run = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  fn();
};

type Props = {
  isVideo: boolean;
  zoom: number;
  onZoomStep: (factor: number) => void;
  onResetZoom: () => void;
  /** Nút "Xem bản gốc" (null = ẩn) + dung lượng file gốc. */
  viewOriginal: { onClick: () => void; sizeBytes?: number | null } | null;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** Các hành động sau undefined = ẩn nút (vd đang xem tạm ảnh tương tự). */
  favorite?: { active: boolean; onToggle: () => void };
  onAddToAlbum?: () => void;
  /** Mở trang chỉnh ảnh (basic edit). */
  onEdit?: () => void;
  downloadHref?: string;
  onDelete?: () => void;
  onClose: () => void;
};

/** Hàng nút góc trên phải của Lightbox: zoom · bản gốc · chi tiết · tim · album · tải · xoá · đóng — rê chuột để xem nút làm gì (LightboxHint). */
export const LightboxToolbar: React.FC<Props> = ({
  isVideo,
  zoom,
  onZoomStep,
  onResetZoom,
  viewOriginal,
  detailsOpen,
  onToggleDetails,
  favorite,
  onAddToAlbum,
  onEdit,
  downloadHref,
  onDelete,
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <div
      className="pointer-events-none absolute top-3 right-3 left-3 z-50 flex flex-wrap items-center justify-end gap-2"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {!isVideo && (
        <div className={PILL}>
          <LightboxHint label={t("lightbox.zoomOut")} hint={t("lightbox.hints.zoomOut")} shortcut="−">
            <button onClick={run(() => onZoomStep(1 / 1.25))} className={ICON_BUTTON} aria-label={t("lightbox.zoomOut")}>
              <ZoomOut size={18} />
            </button>
          </LightboxHint>
          <LightboxHint label={t("lightbox.hints.zoomLevelLabel")} hint={t("lightbox.hints.zoomLevel")} shortcut="0">
            <button
              onClick={run(onResetZoom)}
              className="h-9 w-12 rounded-full text-center text-xs font-medium tabular-nums text-foreground transition hover:bg-foreground/10 hover:text-foreground"
              aria-label={t("lightbox.resetZoom")}
            >
              {Math.round(zoom * 100)}%
            </button>
          </LightboxHint>
          <LightboxHint label={t("lightbox.zoomIn")} hint={t("lightbox.hints.zoomIn")} shortcut="+">
            <button onClick={run(() => onZoomStep(1.25))} className={ICON_BUTTON} aria-label={t("lightbox.zoomIn")}>
              <ZoomIn size={18} />
            </button>
          </LightboxHint>
          {zoom > 1 && (
            <LightboxHint label={t("lightbox.resetZoom")} hint={t("lightbox.hints.resetZoom")} shortcut="0">
              <button onClick={run(onResetZoom)} className={ICON_BUTTON} aria-label={t("lightbox.resetZoom")}>
                <RotateCcw size={16} />
              </button>
            </LightboxHint>
          )}
        </div>
      )}
      {viewOriginal && (
        <LightboxHint label={t("lightbox.viewOriginal")} hint={t("lightbox.hints.viewOriginal")}>
          <button
            onClick={run(viewOriginal.onClick)}
            className="pointer-events-auto glass-soft flex h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground/80 transition hover:text-foreground"
          >
            <Maximize2 size={14} />
            {t("lightbox.viewOriginal")}
            {viewOriginal.sizeBytes ? (
              <span className="text-muted-foreground">{formatBytes(viewOriginal.sizeBytes)}</span>
            ) : null}
          </button>
        </LightboxHint>
      )}
      <div className={PILL}>
        <LightboxHint
          label={detailsOpen ? t("lightbox.hints.detailClose") : t("lightbox.detail")}
          hint={t("lightbox.hints.detail")}
        >
          <button
            onClick={run(onToggleDetails)}
            className={cn(ICON_BUTTON, detailsOpen && "bg-foreground/15 text-foreground")}
            aria-label={t("lightbox.detail")}
            aria-pressed={detailsOpen}
          >
            <Info size={20} />
          </button>
        </LightboxHint>
        {favorite && (
          <LightboxHint
            label={favorite.active ? t("lightbox.hints.unfavoriteLabel") : t("lightbox.favorite")}
            hint={favorite.active ? t("lightbox.hints.unfavorite") : t("lightbox.hints.favorite")}
          >
            <button
              onClick={run(favorite.onToggle)}
              className={cn(ICON_BUTTON, favorite.active && "text-rose-500 dark:text-rose-400")}
              aria-label={t("lightbox.favorite")}
              aria-pressed={favorite.active}
            >
              <Heart size={20} className={favorite.active ? "fill-rose-500 dark:fill-rose-400" : ""} />
            </button>
          </LightboxHint>
        )}
        {onEdit && (
          <LightboxHint label={t("lightbox.edit")} hint={t("lightbox.hints.edit")} shortcut="E">
            <button onClick={run(onEdit)} className={ICON_BUTTON} aria-label={t("lightbox.edit")}>
              <SlidersHorizontal size={20} />
            </button>
          </LightboxHint>
        )}
        {onAddToAlbum && (
          <LightboxHint label={t("albums.addTo")} hint={t("lightbox.hints.addToAlbum")}>
            <button onClick={run(onAddToAlbum)} className={ICON_BUTTON} aria-label={t("albums.addTo")}>
              <FolderPlus size={20} />
            </button>
          </LightboxHint>
        )}
        {downloadHref && (
          <LightboxHint label={t("lightbox.download")} hint={t("lightbox.hints.download")}>
            <a
              href={downloadHref}
              onClick={(e) => e.stopPropagation()}
              className={ICON_BUTTON}
              aria-label={t("lightbox.download")}
            >
              <Download size={20} />
            </a>
          </LightboxHint>
        )}
        {onDelete && (
          <LightboxHint label={t("lightbox.delete")} hint={t("lightbox.hints.delete")}>
            <button onClick={run(onDelete)} className={ICON_BUTTON} aria-label={t("lightbox.delete")}>
              <Trash2 size={20} />
            </button>
          </LightboxHint>
        )}
        <LightboxHint label={t("lightbox.close")} hint={t("lightbox.hints.close")} shortcut="Esc">
          <button onClick={onClose} className={ICON_BUTTON} aria-label={t("lightbox.close")}>
            <X size={20} />
          </button>
        </LightboxHint>
      </div>
    </div>
  );
};
