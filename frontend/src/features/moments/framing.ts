// CSS của khung ảnh moment (web) — card và bộ chỉnh khung dùng chung để preview đúng như khi đăng.
import type { CSSProperties } from "react";
import type { MomentFraming } from "@tng/shared";

/** object-position = điểm (x, y) của ảnh; zoom phóng quanh chính điểm đó. */
export function framingStyle(f: MomentFraming | null | undefined): CSSProperties | undefined {
  if (!f) return undefined;
  const at = `${f.x * 100}% ${f.y * 100}%`;
  return { objectPosition: at, transformOrigin: at, transform: f.zoom > 1 ? `scale(${f.zoom})` : undefined };
}
