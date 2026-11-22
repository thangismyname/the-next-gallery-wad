// Dữ liệu dùng chung cho Lab (web + mobile): đọc result.json, định dạng số, tone màu theo nguồn AI.
import type { LabCell } from "../types";

export type Obj = Record<string, unknown>;

export function pick(obj: unknown, path: string): number | undefined {
  let cur = obj;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Obj)[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : undefined;
}

export const rowsAt = (obj: unknown, ...path: string[]): Obj[] => {
  let cur = obj;
  for (const key of path) cur = cur && typeof cur === "object" ? (cur as Obj)[key] : undefined;
  return Array.isArray(cur) ? (cur as Obj[]) : [];
};

export const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// ── E2 ──

export type SourceKind = "clip" | "yolo" | "dino" | "fusion" | "reference";

/** Màu theo nguồn AI (cùng quy ước lib/aiColors.ts: CLIP sky, YOLO emerald, DINOv3 violet) + gộp = amber,
 *  mốc tham chiếu (oracle, paper) = xám. Thứ tự kiểm tra quan trọng: "fused_learned_ft" là gộp, không phải YOLO. */
export function sourceKind(label: string): SourceKind {
  if (label === "oracle" || label === "paper") return "reference";
  if (/fused|per_tag|^or$|^and$|group_baseline|clip_dino/.test(label)) return "fusion";
  if (label.includes("dino")) return "dino";
  if (label.includes("yolo")) return "yolo";
  return "clip";
}

/** Màu logic của 1 cột / đường: nguồn AI, "fail" (ngoài ngưỡng), "muted" (xám phụ). Web (`features/lab/colors.ts`)
 *  và mobile (`features/lab/labColors.ts`) đổi tone ra màu thật — dữ liệu ở đây không chứa màu nền tảng. */
export type Tone = SourceKind | "fail" | "muted";

/** Số hiển thị: delta có dấu, gap / pct = %, số nguyên giữ nguyên, ≥ 10 → 1 chữ số lẻ, còn lại 3. */
export function fmt(key: string, v: number | string | undefined): string {
  if (typeof v !== "number") return v ?? "";
  if (key === "gap" || key === "pct") return v.toFixed(0);
  const digits = Math.abs(v) >= 10 ? 1 : 3;
  const text = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(digits);
  return key === "delta" && v > 0 ? `+${text}` : text;
}

// ── build: dữ liệu theo split ──

/** Phân bố AP theo lớp (CSV per_class) thành `bins` khoảng đều [0, 1], cao → thấp. */
export function apHistogram(rows: Record<string, LabCell>[], key = "test_AP", bins = 10) {
  const counts = Array.from({ length: bins }, () => 0);
  for (const r of rows) {
    const v = num(r[key]);
    if (v == null) continue;
    counts[Math.min(bins - 1, Math.floor(v * bins))]++;
  }
  return counts
    .map((count, i) => ({ label: `${(i / bins).toFixed(1)}–${((i + 1) / bins).toFixed(1)}`, count }))
    .reverse();
}

/** `n` lớp có `key` thấp nhất (bỏ lớp không có giá trị). */
export function worstClasses(rows: Record<string, LabCell>[], key = "test_AP", n = 12) {
  return rows
    .filter((r) => num(r[key]) != null)
    .sort((a, b) => (a[key] as number) - (b[key] as number))
    .slice(0, n)
    .map((r) => ({ label: String(r.class), value: r[key] as number, group: String(r.group ?? "") }));
}

/** Cột Δ có CI: có ý nghĩa = tone nguồn của `a` ("boost_prob:yolo" → yolo), không = xám. */
export const ciTone = (r: { a: string; significant: boolean }): Tone =>
  r.significant ? sourceKind(r.a.split(":").pop() ?? r.a) : "muted";

export const v = (x?: number) => (x == null ? "—" : fmt("value", x));

export const signed = (x?: number) => (x == null ? "—" : fmt("delta", x));
