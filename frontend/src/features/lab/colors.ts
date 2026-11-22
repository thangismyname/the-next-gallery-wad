// Màu web của Lab: tone (từ @tng/shared/lab) → màu CSS. Cùng màu với lib/aiColors.ts (Tailwind 500):
// CLIP sky · YOLO emerald · DINOv3 violet; gộp = amber; xám = mốc tham chiếu / phụ. Mobile: features/lab/labColors.ts.
import { sourceKind, type SourceKind, type Tone } from "@tng/shared/lab";

export const KIND_COLOR: Record<SourceKind, string> = {
  clip: "oklch(0.685 0.169 237.3)",
  yolo: "oklch(0.696 0.17 162.5)",
  dino: "oklch(0.606 0.25 292.7)",
  fusion: "oklch(0.769 0.188 70.1)",
  reference: "var(--muted-foreground)",
};

/** Ngoài ngưỡng / kém hơn mốc. */
export const FAIL_COLOR = "oklch(0.645 0.246 16.4)";
export const MUTED = "var(--muted-foreground)";

export const toneColor = (tone: Tone) => (tone === "fail" ? FAIL_COLOR : tone === "muted" ? MUTED : KIND_COLOR[tone]);
export const colorOf = (label: string) => KIND_COLOR[sourceKind(label)];
