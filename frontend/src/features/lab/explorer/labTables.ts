// Biến result.json / CSV bất kỳ của experiments thành bảng số để vẽ — không biết trước schema
// từng experiment (E1–E6 khác nhau), nên dò theo hình dạng dữ liệu.

export interface MetricTable {
  title: string;
  metrics: string[];
  rows: { label: string; values: Record<string, number> }[];
}

export interface StatGroup {
  title: string;
  stats: { key: string; value: number }[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Mảng bản ghi → bảng: cột số = metric; nhãn = cột chữ có thay đổi, thêm dần đến khi nhãn không trùng (≤ 3). */
export function recordsTable(title: string, records: Obj[], labelKeys?: string[]): MetricTable | null {
  if (!records.length) return null;
  const columns = [...new Set(records.flatMap(Object.keys))];
  const metrics = columns.filter(
    (c) => records.some((r) => isNum(r[c])) && records.every((r) => r[c] == null || isNum(r[c])),
  );
  if (!metrics.length) return null;

  let keys = labelKeys ?? [];
  if (!labelKeys) {
    const varying = columns.filter(
      (c) => !metrics.includes(c) && new Set(records.map((r) => String(r[c] ?? ""))).size > 1,
    );
    for (const c of varying.slice(0, 3)) {
      keys = [...keys, c];
      if (new Set(records.map((r) => labelOf(r, keys))).size === records.length) break;
    }
  }
  return {
    title,
    metrics,
    rows: records.map((r, i) => ({
      label: labelOf(r, keys) || `#${i + 1}`,
      values: Object.fromEntries(metrics.filter((m) => isNum(r[m])).map((m) => [m, r[m] as number])),
    })),
  };
}

const labelOf = (r: Obj, keys: string[]) =>
  keys.map((k) => r[k]).filter((v) => v != null && v !== "").join(" · ");

/** Duyệt result.json: mảng bản ghi → bảng; object có ≥ 2 con là object số cùng khoá → bảng (hàng = tên con);
 *  số đứng lẻ → nhóm chỉ số (thẻ). */
export function extractResult(result: unknown): { tables: MetricTable[]; stats: StatGroup[] } {
  const tables: MetricTable[] = [];
  const stats: StatGroup[] = [];

  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      const table = node.every(isObj) ? recordsTable(path, node as Obj[]) : null;
      if (table) tables.push(table);
      return;
    }
    if (!isObj(node)) return;
    const entries = Object.entries(node);
    const scalars = entries.filter(([, v]) => isNum(v)).map(([key, value]) => ({ key, value: value as number }));
    if (scalars.length) stats.push({ title: path, stats: scalars });

    const numericChildren = entries.filter(([, v]) => isObj(v) && Object.values(v).some(isNum)) as [string, Obj][];
    const first = numericChildren[0] ? new Set(numericKeys(numericChildren[0][1])) : new Set<string>();
    const grouped = numericChildren.filter(([, v]) => numericKeys(v).some((k) => first.has(k)));
    if (grouped.length >= 2) {
      const metrics = [...new Set(grouped.flatMap(([, v]) => numericKeys(v)))];
      tables.push({
        title: path,
        metrics,
        rows: grouped.map(([label, v]) => ({
          label,
          values: Object.fromEntries(numericKeys(v).map((k) => [k, v[k] as number])),
        })),
      });
    }
    for (const [key, value] of entries) {
      if (grouped.length >= 2 && grouped.some(([k]) => k === key)) continue;
      if (Array.isArray(value) || isObj(value)) walk(value, path ? `${path}.${key}` : key);
    }
  };

  walk(result, "");
  return { tables, stats };
}

const numericKeys = (o: Obj) => Object.keys(o).filter((k) => isNum(o[k]));

/** Mặc định vẽ ≤ n metric: ưu tiên metric dạng điểm 0–1 (mAP, F1, P@k…) để chung 1 trục. */
export function defaultMetrics(table: MetricTable, n = 3): string[] {
  const inUnit = table.metrics.filter((m) =>
    table.rows.every((r) => r.values[m] == null || (r.values[m] >= 0 && r.values[m] <= 1)),
  );
  return (inUnit.length ? inUnit : table.metrics).slice(0, n);
}

/** Bảng dài (per-class…) → chỉ `limit` hàng cao nhất / thấp nhất theo `metric`; ngắn → giữ thứ tự gốc. */
export function visibleRows(table: MetricTable, metric: string | undefined, mode: "top" | "bottom", limit = 25) {
  if (table.rows.length <= limit || !metric) return table.rows;
  const withValue = table.rows.filter((r) => r.values[metric] != null);
  const sorted = [...withValue].sort((a, b) => b.values[metric] - a.values[metric]);
  return mode === "top" ? sorted.slice(0, limit) : sorted.slice(-limit).reverse();
}

export const formatValue = (v: number | null | undefined) =>
  v == null ? "—" : Number.isInteger(v) ? v.toLocaleString() : String(+v.toFixed(4));

// Màu series: app đơn sắc nên biểu đồ nhiều series cần màu phân biệt riêng.
export const SERIES = [
  "var(--foreground)",
  "oklch(0.685 0.169 237.3)",
  "oklch(0.769 0.188 70.1)",
  "oklch(0.645 0.246 16.4)",
  "oklch(0.696 0.17 162.5)",
  "oklch(0.606 0.25 292.7)",
];
