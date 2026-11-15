import { ObjectDetection } from "@tng/shared";
import { useEffect, useState } from "react";
import { fetchMediaDetections } from "@/services/media";

// Cache trong phiên — tránh gọi lại API khi mở cùng ảnh nhiều lần.
const cache = new Map<string, ObjectDetection[]>();

/**
 * Lấy detection (kèm bbox) của 1 ảnh cho Developer Mode. Chỉ nên gọi khi đã bật
 * Developer Mode để tránh request thừa.
 */
export function useMediaDetections(mediaId: string | null) {
  const [detections, setDetections] = useState<ObjectDetection[]>(
    mediaId ? (cache.get(mediaId) ?? []) : [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mediaId) {
      setDetections([]);
      return;
    }

    const cached = cache.get(mediaId);
    if (cached) {
      setDetections(cached);
      return;
    }

    let alive = true;
    setLoading(true);
    fetchMediaDetections(mediaId)
      .then((dets) => {
        cache.set(mediaId, dets);
        if (alive) {
          setDetections(dets);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [mediaId]);

  return { detections, loading };
}
