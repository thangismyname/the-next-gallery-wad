import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { mediaApi } from "@/services";

import { detailKeys } from "./useMediaDetails";

/**
 * Developer Mode: YOLO boxes drawn over the photo (web `DetectionOverlay`). Lives
 * inside the page's image box (same size as the shown photo), so bbox 0–1 → %
 * and it follows zoom / paging / dismiss for free. Same cache as the info sheet.
 */
export function DetectionOverlay({ mediaId }: { mediaId: string }) {
  const { data = [] } = useQuery({
    queryKey: detailKeys.detections(mediaId),
    queryFn: () => mediaApi.fetchMediaDetections(mediaId),
    staleTime: 60_000,
  });
  if (!data.length) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      {data.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox ?? [];
        if ([x1, y1, x2, y2].some((v) => typeof v !== "number" || Number.isNaN(v))) return null;
        return (
          <View
            key={`${det.class_name}-${i}`}
            className="absolute rounded-sm border-2 border-emerald-400"
            style={{
              left: `${x1 * 100}%`,
              top: `${y1 * 100}%`,
              width: `${Math.max(0, (x2 - x1) * 100)}%`,
              height: `${Math.max(0, (y2 - y1) * 100)}%`,
            }}
          >
            {/* On the photo → dark-on-image label like the web (emerald = YOLO). */}
            <View className="absolute -top-[18px] left-[-2px] rounded-sm bg-emerald-400 px-1 py-px">
              <Text numberOfLines={1} className="text-[10px] font-medium text-black">
                {det.class_name} {Math.round(det.confidence * 100)}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
