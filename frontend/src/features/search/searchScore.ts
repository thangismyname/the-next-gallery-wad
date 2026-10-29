// Hàm thuần cho kết quả Spotlight: điểm search kết hợp → nguồn AI.
import type { AiSource } from "@/lib/aiColors";
import type { MediaListItem } from "@/services/media";

type ScoreParts = MediaListItem["scoreParts"];

/** Thành phần điểm → nguồn AI (màu chấm trên ảnh kết quả). */
export const SCORE_SOURCE = { clip: "clip", tag: "tag", object: "yolo" } as const satisfies Record<
  string,
  AiSource
>;
export type ScorePart = keyof typeof SCORE_SOURCE;

/** Các thành phần có điểm của 1 ảnh (theo thứ tự CLIP · Tag · YOLO). */
export const presentScoreParts = (parts: ScoreParts): ScorePart[] =>
  parts
    ? (Object.keys(SCORE_SOURCE) as ScorePart[]).filter((k) => typeof parts[k] === "number")
    : [];

/** Tooltip "CLIP 8% · Tag 99% · YOLO 94%" — vì sao ảnh khớp (search kết hợp). */
export function describeScoreParts(parts: ScoreParts) {
  if (!parts) return undefined;
  const labels: Record<ScorePart, string> = { clip: "CLIP", tag: "Tag", object: "YOLO" };
  return presentScoreParts(parts)
    .map((key) => `${labels[key]} ${Math.round(parts[key]! * 100)}%`)
    .join(" · ");
}

/**
 * Chip "câu được tách thành…" ở đầu Spotlight — đếm kết quả theo nguồn AI
 * (YOLO = ảnh có vật thể, Tag = ảnh khớp tag, CLIP = ảnh); bỏ nguồn = 0.
 */
export function sourceChipsFor(media: MediaListItem[], objects: MediaListItem[]) {
  return (
    [
      { source: "yolo", label: "YOLO", n: objects.length },
      { source: "tag", label: "Tag", n: media.filter((m) => typeof m.scoreParts?.tag === "number").length },
      { source: "clip", label: "CLIP", n: media.length },
    ] as const
  ).filter((c) => c.n > 0);
}
