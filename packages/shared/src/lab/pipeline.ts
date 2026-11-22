/**
 * Thứ tự chạy thực nghiệm (Part 0 → 6 trong `ai-service/experiments/README.md`) + bước nào cần kết quả bước
 * nào (cột "Cần" của README) — trục "Theo thứ tự chạy" ở khu Developer. Sửa README thì sửa ở đây.
 */
export const PIPELINE: { id: string; part: string; needs: string[] }[] = [
  { id: "select", part: "0", needs: [] },
  { id: "build", part: "0", needs: ["select"] },
  { id: "e1", part: "1", needs: [] },
  { id: "e2", part: "2", needs: ["build"] },
  { id: "e3", part: "3", needs: ["build"] },
  { id: "e4", part: "4", needs: ["build"] },
  { id: "yolo_ft", part: "4b", needs: ["build", "e4"] },
  { id: "e5", part: "5", needs: ["e2", "e4"] },
  { id: "probe", part: "5b", needs: ["build", "e2", "e5"] },
  { id: "export_tags", part: "5c", needs: ["probe"] },
  { id: "e6", part: "6", needs: ["e5", "probe", "e3"] },
];

/** Experiment ids theo thứ tự chạy; id có trên đĩa nhưng không có trong PIPELINE xếp cuối. */
export function pipelineOrder(ids: string[]): string[] {
  const known = PIPELINE.map((p) => p.id).filter((id) => ids.includes(id));
  return [...known, ...ids.filter((id) => !known.includes(id))];
}
