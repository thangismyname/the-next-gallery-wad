import { useEffect, useState } from "react";
import { fetchSimilarMedia, SimilarMediaResult } from "@/services/media";

const EMPTY: SimilarMediaResult = { source: null, model: null, items: [] };

// Cache trong phiên — mở lại cùng ảnh không gọi lại API (lần đầu có thể chậm
// vì backend tạo descriptor DINOv3 on-demand). Có hạn: URL ảnh trong kết quả
// là URL ký, hết hiệu lực sau 24–48h (backend media.urls.js).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const store = new Map<string, { at: number; data: SimilarMediaResult }>();
const cache = {
  get(id: string) {
    const hit = store.get(id);
    if (!hit) return undefined;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      store.delete(id);
      return undefined;
    }
    return hit.data;
  },
  set(id: string, data: SimilarMediaResult) {
    store.set(id, { at: Date.now(), data });
  },
};

/** Ảnh tương tự (DINOv3) của 1 ảnh. Truyền null để không fetch (panel ẩn / video). */
export function useSimilarMedia(mediaId: string | null) {
  const [result, setResult] = useState<SimilarMediaResult>(
    mediaId ? (cache.get(mediaId) ?? EMPTY) : EMPTY,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mediaId) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }

    const cached = cache.get(mediaId);
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    let alive = true;
    setResult(EMPTY);
    setLoading(true);
    fetchSimilarMedia(mediaId).then((data) => {
      // Không cache kết quả rỗng — có thể descriptor chưa kịp tạo (vừa upload).
      if (data.items.length > 0) cache.set(mediaId, data);
      if (alive) {
        setResult(data);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, [mediaId]);

  return { ...result, loading };
}
