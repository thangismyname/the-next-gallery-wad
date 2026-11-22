// Màu mobile của Lab: tone (từ @tng/shared/lab) → màu cho View / Svg. Cùng bảng màu với web
// `features/lab/colors.ts` (Tailwind 500: CLIP sky · YOLO emerald · DINOv3 violet · gộp amber · ngoài ngưỡng rose);
// xám + chữ lấy từ theme để theo sáng / tối.
import { sourceKind, type SourceKind, type Tone } from "@tng/shared/lab";

import { useTheme } from "@/hooks/useTheme";

const KIND: Record<Exclude<SourceKind, "reference">, string> = {
  clip: "hsl(199 89% 48%)",
  yolo: "hsl(160 84% 39%)",
  dino: "hsl(258 90% 66%)",
  fusion: "hsl(38 92% 50%)",
};
const FAIL = "hsl(350 89% 60%)";

export function useLabColors() {
  const { colors } = useTheme();
  const tone = (t: Tone) =>
    t === "fail" ? FAIL : t === "muted" || t === "reference" ? colors.mutedForeground : KIND[t];
  return {
    tone,
    of: (label: string) => tone(sourceKind(label)),
    fail: FAIL,
    muted: colors.mutedForeground,
    foreground: colors.foreground,
  };
}
