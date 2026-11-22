import { describe, expect, it } from "vitest";
import { defaultMetrics, extractResult, recordsTable, visibleRows } from "./labTables";

describe("recordsTable", () => {
  it("lấy cột số làm metric, cột chữ thay đổi làm nhãn đến khi không trùng", () => {
    const t = recordsTable("x", [
      { split: "test", mode: "boost", source: "yolo", "P@10": 0.5 },
      { split: "test", mode: "boost", source: "clip", "P@10": 0.6 },
      { split: "test", mode: "clip", source: "-", "P@10": 0.4 },
    ])!;
    expect(t.metrics).toEqual(["P@10"]);
    expect(t.rows.map((r) => r.label)).toEqual(["boost · yolo", "boost · clip", "clip · -"]);
  });

  it("cột lẫn chữ không phải metric; không có số → null", () => {
    expect(recordsTable("x", [{ a: "1", b: "x" }])).toBeNull();
    const t = recordsTable("x", [{ c: "dog", v: 1, mix: "n/a" }, { c: "cat", v: null, mix: 2 }])!;
    expect(t.metrics).toEqual(["v"]);
    expect(t.rows[1].values).toEqual({});
  });
});

describe("extractResult", () => {
  it("gom object con cùng khoá thành bảng, số lẻ thành thẻ, mảng thành bảng", () => {
    const { tables, stats } = extractResult({
      covered: 81,
      strategies: { clip_only: { mAP: 0.86, f1: 0.69 }, or: { mAP: 0.88, f1: 0.76 } },
      test: { mAP: 0.88 },
      ci: { lo: 0.87 },
      groups: [{ group: "all", mAP: 0.9 }, { group: "object", mAP: 0.8 }],
    });
    expect(stats.map((s) => s.title)).toEqual(["", "test", "ci"]);
    expect(tables.map((t) => t.title)).toEqual(["strategies", "groups"]);
    expect(tables[0].rows.map((r) => r.label)).toEqual(["clip_only", "or"]);
    expect(tables[1].rows.map((r) => r.label)).toEqual(["all", "object"]);
  });
});

describe("defaultMetrics / visibleRows", () => {
  const table = recordsTable(
    "x",
    Array.from({ length: 30 }, (_, i) => ({ c: `c${i}`, n: i * 10, ap: i / 30 })),
  )!;
  it("ưu tiên metric 0–1", () => expect(defaultMetrics(table)).toEqual(["ap"]));
  it("bảng dài → top / bottom theo metric", () => {
    expect(visibleRows(table, "ap", "top", 3).map((r) => r.label)).toEqual(["c29", "c28", "c27"]);
    expect(visibleRows(table, "ap", "bottom", 2).map((r) => r.label)).toEqual(["c0", "c1"]);
  });
});
