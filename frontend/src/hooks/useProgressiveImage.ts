import { useEffect, useState } from "react";
import type { Media } from "@/types";

/**
 * 3 tầng ảnh của Lightbox: med (placeholder, thường đã có trong cache) →
 * display (≤2048px, ~0.5MB, đủ nét ở tỉ lệ vừa khung) → file GỐC (vài chục–trăm
 * MB) chỉ khi phóng to > 1x hoặc bấm "Bản gốc". Item không có displayUrl →
 * dùng luôn url. Bản display lỗi (ảnh hỏng / server không tạo được) → dùng
 * thẳng file gốc. "Bản gốc" của HEIC = bản WebP full (trình duyệt không hiển
 * thị được HEIC).
 *
 * Component render 2 <img hidden> "loader" (displaySrc / originalSrc) gọi
 * `onDisplayLoad|onDisplayError|onFullLoad`, và 1 <img src={imageSrc}> hiển thị.
 */
export function useProgressiveImage(media: Media, { zoomed }: { zoomed: boolean }) {
  const isVideo = media.mediaType === "video";
  const [displayFailed, setDisplayFailed] = useState(false);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [wantOriginal, setWantOriginal] = useState(false);

  // Đổi ảnh → bắt đầu lại từ tầng thấp nhất.
  useEffect(() => {
    setDisplayLoaded(false);
    setDisplayFailed(false);
    setFullLoaded(false);
    setWantOriginal(false);
  }, [media.id]);

  const originalSrc = media.fullUrl || media.url;
  const displaySrc = (!displayFailed && media.displayUrl) || originalSrc;
  const hasDisplay = !isVideo && Boolean(media.displayUrl) && !displayFailed;
  const needOriginal = hasDisplay && (wantOriginal || zoomed);
  const imageSrc = fullLoaded
    ? originalSrc
    : displayLoaded
      ? displaySrc
      : media.thumbnailUrlLarge || displaySrc;

  return {
    imageSrc,
    displaySrc,
    originalSrc,
    displayLoaded,
    fullLoaded,
    hasDisplay,
    needOriginal,
    /** Bấm "Bản gốc". */
    requestOriginal: () => setWantOriginal(true),
    onDisplayLoad: () => setDisplayLoaded(true),
    // Display lỗi → thử file gốc; chính file gốc cũng lỗi → thôi chờ (hiện ảnh lỗi).
    onDisplayError: () => {
      if (displaySrc !== originalSrc) setDisplayFailed(true);
      else setDisplayLoaded(true);
    },
    onFullLoad: () => setFullLoaded(true),
  };
}
