// Cỡ chữ toàn app (Settings → Giao diện): đổi font-size của <html>, mọi class Tailwind theo rem co giãn theo.
// Class px cố định (text-[10px]…) không đổi. Lưu localStorage, áp dụng ngay lúc khởi động (main.tsx).
import { create } from "zustand";

export type FontScale = "small" | "default" | "large" | "xlarge";

export const FONT_SCALES: Record<FontScale, string> = {
  small: "93.75%", // 15px
  default: "100%", // 16px
  large: "112.5%", // 18px
  xlarge: "125%", // 20px
};

const STORAGE_KEY = "tng.fontScale";
const isScale = (v: unknown): v is FontScale => typeof v === "string" && v in FONT_SCALES;

const read = (): FontScale => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isScale(v) ? v : "default";
  } catch {
    return "default";
  }
};

const apply = (scale: FontScale) => {
  document.documentElement.style.fontSize = FONT_SCALES[scale];
};

export const useFontScale = create<{ scale: FontScale; setScale: (s: FontScale) => void }>((set) => ({
  scale: read(),
  setScale: (scale) => {
    apply(scale);
    try {
      localStorage.setItem(STORAGE_KEY, scale);
    } catch {
      // private mode: vẫn áp dụng cho phiên này
    }
    set({ scale });
  },
}));

/** Gọi 1 lần trước khi render (tránh nháy cỡ chữ). */
export const applyStoredFontScale = () => apply(read());
