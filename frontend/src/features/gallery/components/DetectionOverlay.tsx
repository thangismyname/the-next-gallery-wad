import { ObjectDetection } from "@tng/shared";
import React from "react";

interface DetectionOverlayProps {
  detections: ObjectDetection[];
}

/**
 * Vẽ bounding box YOLO lên trên ảnh (Developer Mode). Box dùng toạ độ chuẩn hoá
 * 0–1 → % nên tự scale theo khung ảnh. Component này đặt absolute inset-0 trong
 * 1 wrapper có kích thước đúng bằng ảnh đang hiển thị.
 */
export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  detections,
}) => {
  if (detections.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((det, index) => {
        const [x1, y1, x2, y2] = det.bbox ?? [];
        if (
          [x1, y1, x2, y2].some((v) => typeof v !== "number" || Number.isNaN(v))
        ) {
          return null;
        }
        const width = Math.max(0, (x2 - x1) * 100);
        const height = Math.max(0, (y2 - y1) * 100);
        return (
          <div
            key={`${det.class_name}-${index}`}
            className="absolute border-2 border-emerald-400 rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{
              left: `${x1 * 100}%`,
              top: `${y1 * 100}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
          >
            <span className="absolute -top-4.5 left-0 max-w-full truncate rounded-sm bg-emerald-400 px-1 py-0.5 text-[10px] font-medium leading-tight text-black">
              {det.class_name} {Math.round(det.confidence * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};
