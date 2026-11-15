// Nội dung màn Welcome = landing web (`frontend/src/features/landing/components/*`):
// cùng chữ (i18n hero.* · capabilities.* · workflow.* · closing.* · preview.*), cùng ảnh
// minh hoạ và toạ độ khung YOLO. Đổi landing web thì đổi ở đây.

/** Tên công nghệ / tính năng (tên riêng — không dịch) cho băng chữ chạy (Hero). */
export const MARQUEE = [
  "CLIP semantic search",
  "YOLO26 objects",
  "DINOv3 similar photos",
  "17 content tags",
  "Hybrid search",
  "Smart albums",
  "HEIC · Video",
  "WebRTC P2P",
  "pgvector",
  "vi · en · ja",
];

export type Box = { label: string; conf: number; x1: number; y1: number; x2: number; y2: number };
export type Shot = {
  source: number;
  /** width / height của khung hiển thị (bbox tính theo vùng ảnh đang hiển thị). */
  aspect: number;
  /** Ảnh bị cắt: vị trí lấy nét theo chiều dọc (0–1), như object-position của web. */
  focusY?: number;
  boxes: Box[];
  tag: { key: string; conf: number };
};

export const SHOTS: Shot[] = [
  {
    source: require("../../../assets/images/landing/street.webp"),
    aspect: 736 / 919,
    boxes: [
      { label: "person", conf: 96, x1: 0.17, y1: 0.23, x2: 0.79, y2: 0.98 },
      { label: "person", conf: 88, x1: 0.78, y1: 0.43, x2: 0.98, y2: 0.62 },
    ],
    tag: { key: "street", conf: 97 },
  },
  {
    source: require("../../../assets/images/landing/portrait.webp"),
    aspect: 736 / 981,
    boxes: [{ label: "person", conf: 98, x1: 0.24, y1: 0.23, x2: 0.81, y2: 0.94 }],
    tag: { key: "portrait", conf: 92 },
  },
  {
    source: require("../../../assets/images/landing/car.webp"),
    // Ảnh dọc 9:16 cắt thành 4:3 quanh chiếc xe (web: object-position 50% 78.5%).
    aspect: 4 / 3,
    focusY: 0.785,
    boxes: [{ label: "car", conf: 97, x1: 0.04, y1: 0.35, x2: 0.94, y2: 0.66 }],
    tag: { key: "vehicles", conf: 99 },
  },
];

/** Đúng các tính năng app đang có — tên · mô tả · mô hình đứng sau. */
export const CAPABILITIES = [
  { key: "semanticSearch", model: "CLIP · YOLO26" },
  { key: "objectDetection", model: "YOLO26" },
  { key: "visualSimilarity", model: "DINOv3" },
  { key: "autoClassification", model: "CLIP probe" },
  { key: "smartAlbums", model: "Hybrid search" },
  { key: "sharing", model: "WebRTC" },
] as const;

/** Số liệu nhanh (giá trị cố định của hệ thống, nhãn dịch theo ngôn ngữ). */
export const STATS = [
  { value: "3", key: "models" },
  { value: "17", key: "tags" },
  { value: "80", key: "objects" },
  { value: "3", key: "languages" },
] as const;

export const STEPS = ["upload", "analyze", "find"] as const;

export const SLIDES = ["hero", "showcase", "pipeline", "capabilities", "workflow", "closing"] as const;
export type SlideId = (typeof SLIDES)[number];
