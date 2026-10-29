// Màu nhận diện từng nguồn AI — dùng chung cho landing và trong app để người
// dùng luôn biết kết quả đến từ đâu: YOLO = xanh lá, CLIP = xanh dương,
// Tag (phân loại) = xám, DINOv3 = tím. Class viết tĩnh để Tailwind quét được.
export type AiSource = "yolo" | "clip" | "tag" | "dino";

/** Chip trên nền theo theme: light = nền nhạt chữ đen, dark = nền trong suốt chữ màu. */
export const AI_CHIP: Record<AiSource, string> = {
  yolo: "bg-emerald-200 text-black dark:bg-emerald-400/20 dark:text-emerald-300",
  clip: "bg-sky-200 text-black dark:bg-sky-400/20 dark:text-sky-300",
  tag: "bg-zinc-200 text-black dark:bg-primary/15 dark:text-foreground",
  dino: "bg-violet-200 text-black dark:bg-violet-400/20 dark:text-violet-300",
};

/** Chip trên nền luôn tối (Lightbox, phủ lên ảnh). */
export const AI_CHIP_ON_DARK: Record<AiSource, string> = {
  yolo: "bg-emerald-400/15 text-emerald-300",
  clip: "bg-sky-400/15 text-sky-300",
  tag: "bg-white/10 text-white/85",
  dino: "bg-violet-400/15 text-violet-300",
};

/** Thanh tiến độ / chấm màu. */
export const AI_BAR: Record<AiSource, string> = {
  yolo: "bg-emerald-500",
  clip: "bg-sky-500",
  tag: "bg-primary",
  dino: "bg-violet-500",
};
