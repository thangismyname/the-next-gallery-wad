import React from "react";
import { useTranslation } from "react-i18next";
import {
  Heart,
  CalendarDays,
  Camera,
  Image as ImageIcon,
  HardDrive,
  Timer,
  ScanLine,
  Tags,
  Images,
  Loader2,
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { popIn } from "@/lib/motion";
import { Media } from "@/types";
import { MediaListItem } from "@/services/media";
import { cn } from "@/lib/utils";
import { AI_CHIP_ON_DARK } from "@/lib/aiColors";
import { useMediaDetections } from "@/hooks/useMediaDetections";
import { useSimilarMedia } from "@/hooks/useSimilarMedia";
import { formatBytes, formatDateTime, formatDuration } from "@/utils/format";
import { MediaAlbumsSection } from "@/features/albums/components/MediaAlbumsSection";
import { MediaLabelsSection } from "@/features/favorites/components/MediaLabelsSection";

// = backend AI_YOLO_MIN_CONF (mặc định 0.4): YOLO lưu vật thể từ 0.25 nhưng
// search chỉ tin từ ngưỡng này → chip dưới ngưỡng hiện mờ (tìm sẽ không ra).
const YOLO_SEARCH_MIN_CONF = 0.4;

interface MediaDetailsPanelProps {
  media: Media;
  /** Chỉ fetch detection khi panel đang mở (tránh request thừa khi panel ẩn). */
  active?: boolean;
  /** Bấm 1 ảnh trong mục "Ảnh tương tự" (DINOv3). */
  onSelectSimilar?: (item: MediaListItem) => void;
}

const DetailRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <span className="mt-0.5 flex items-center text-white/40">{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-white/40">
        {label}
      </p>
      <p className="text-sm text-white wrap-break-word">{value}</p>
    </div>
  </div>
);

/** Panel chi tiết inline — nằm bên trái ảnh trong layout flex của Lightbox */
export const MediaDetailsPanel: React.FC<MediaDetailsPanelProps> = ({
  media,
  active = true,
  onSelectSimilar,
}) => {
  const { t } = useTranslation();
  const isVideo = media.mediaType === "video";
  const { detections } = useMediaDetections(active ? media.id : null);
  const reduce = useReducedMotion();
  const fileSize = media.sizeBytes ? formatBytes(media.sizeBytes) : "";
  const takenAt = formatDateTime(media.takenAt);
  const createdAt = formatDateTime(media.createdAt);
  const similar = useSimilarMedia(active && !isVideo ? media.id : null);

  // Gộp theo class: giữ confidence cao nhất + đếm số lần xuất hiện.
  const tagMap = new Map<string, { confidence: number; count: number }>();
  for (const det of detections) {
    const existing = tagMap.get(det.class_name);
    if (existing) {
      existing.count += 1;
      existing.confidence = Math.max(existing.confidence, det.confidence);
    } else {
      tagMap.set(det.class_name, {
        confidence: det.confidence,
        count: 1,
      });
    }
  }
  const tags = Array.from(tagMap.entries()).sort(
    (a, b) => b[1].confidence - a[1].confidence,
  );

  return (
    <div
      className="h-full w-full md:w-80 shrink-0 flex flex-col md:border-l border-white/10 bg-white/3"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">
          {t("lightbox.detail")}
        </h3>
      </div>

      {/* Scrollable content — min-h-0 để cuộn được trong chiều cao giới hạn (mobile) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {media.title && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">
              {t("lightbox.detailTitle")}
            </p>
            <p className="text-sm text-white wrap-break-word">{media.title}</p>
          </div>
        )}

        <div className="space-y-2.5">
          <DetailRow
            icon={<ImageIcon size={14} />}
            label={t("lightbox.detailType")}
            value={isVideo ? t("lightbox.video") : t("lightbox.photo")}
          />
          {media.width && media.height && (
            <DetailRow
              icon={<ScanLine size={14} />}
              label={t("lightbox.detailResolution")}
              value={`${media.width} × ${media.height}px`}
            />
          )}
          {fileSize && (
            <DetailRow
              icon={<HardDrive size={14} />}
              label={t("lightbox.detailSize")}
              value={fileSize}
            />
          )}
          {isVideo && formatDuration(media.durationSeconds) && (
            <DetailRow
              icon={<Timer size={14} />}
              label={t("lightbox.detailDuration")}
              value={formatDuration(media.durationSeconds)}
            />
          )}
          {takenAt && (
            <DetailRow
              icon={<Camera size={14} />}
              label={t("lightbox.detailTaken")}
              value={takenAt}
            />
          )}
          {createdAt && (
            <DetailRow
              icon={<CalendarDays size={14} />}
              label={t("lightbox.detailDate")}
              value={createdAt}
            />
          )}
        </div>

        {/* Tag nội dung (phân loại CLIP) — xám, như chip "Tag" ở landing */}
        {(media.aiTags?.length ?? 0) > 0 && (
          <div className="pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={13} className="text-white/40" />
              <p className="text-[11px] uppercase tracking-wide text-white/40">
                {t("lightbox.detailTags")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {media.aiTags.map((tag, i) => (
                <motion.span
                  key={`${media.id}-${tag}`}
                  {...popIn(i, reduce)}
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                    AI_CHIP_ON_DARK.tag,
                  )}
                >
                  {t(`studio.tags.${tag}`, { defaultValue: tag })}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-2">
              <Tags size={13} className="text-white/40" />
              <p className="text-[11px] uppercase tracking-wide text-white/40">
                {t("lightbox.detailObjects")}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(([name, info], i) => {
                const searchable = info.confidence >= YOLO_SEARCH_MIN_CONF;
                return (
                <motion.span
                  key={`${media.id}-${name}`}
                  {...popIn(i, reduce, 0.04)}
                  title={
                    searchable
                      ? `${Math.round(info.confidence * 100)}%`
                      : t("lightbox.lowConfidence", { pct: Math.round(info.confidence * 100) })
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                    searchable
                      ? AI_CHIP_ON_DARK.yolo
                      : "border border-dashed border-white/15 text-white/40",
                  )}
                >
                  {name}
                  {info.count > 1 && (
                    <span className={searchable ? "text-emerald-300/70" : undefined}>
                      ×{info.count}
                    </span>
                  )}
                </motion.span>
                );
              })}
            </div>
            {tags.some(([, info]) => info.confidence < YOLO_SEARCH_MIN_CONF) && (
              <p className="mt-2 text-[11px] text-white/35">
                {t("lightbox.lowConfidenceNote", { pct: YOLO_SEARCH_MIN_CONF * 100 })}
              </p>
            )}
          </div>
        )}

        <MediaLabelsSection mediaId={media.id} active={active} />

        <MediaAlbumsSection mediaId={media.id} active={active} />

        {!isVideo && (
          <div className="pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-2">
              <Images size={13} className="text-white/40" />
              <p className="text-[11px] uppercase tracking-wide text-white/40">
                {t("lightbox.similar")}
              </p>
              {similar.source && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 py-0.5 text-[10px]",
                    similar.source === "dinov3"
                      ? AI_CHIP_ON_DARK.dino
                      : AI_CHIP_ON_DARK.clip,
                  )}
                  title={similar.model ?? undefined}
                >
                  {similar.source === "dinov3" ? "DINOv3" : "CLIP"}
                </span>
              )}
            </div>
            {similar.loading ? (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Loader2 size={14} className="animate-spin" />
                {t("lightbox.similarLoading")}
              </div>
            ) : similar.items.length === 0 ? (
              <p className="text-xs text-white/40">
                {t("lightbox.similarEmpty")}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {similar.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSimilar?.(item)}
                    className="group relative aspect-square overflow-hidden rounded-md bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    title={item.title ?? undefined}
                  >
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title ?? ""}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {item.score != null && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] tabular-nums text-white/90">
                        {Math.round(item.score * 100)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-white/10">
          <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">
            {t("lightbox.detailFavorite")}
          </p>
          <p
            className={cn(
              "inline-flex items-center gap-1.5 text-sm",
              media.isFavorite ? "text-rose-400" : "text-white/60",
            )}
          >
            <Heart
              size={14}
              className={media.isFavorite ? "fill-rose-400" : ""}
            />
            {media.isFavorite
              ? t("lightbox.detailFavoriteYes")
              : t("lightbox.detailFavoriteNo")}
          </p>
        </div>
      </div>
    </div>
  );
};
