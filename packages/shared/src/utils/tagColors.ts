// Màu của tag nội dung (AI phân loại) theo NHÓM — dùng chung web + mobile để cùng
// một tag luôn cùng màu. Mỗi app tự map tên màu → class Tailwind tĩnh
// (web `lib/aiColors.ts::TAG_CHIP`, mobile `lib/aiColors.ts::TAG_CHIP`).
// Cố ý KHÔNG dùng emerald / sky / violet: đó là màu nguồn AI (YOLO / CLIP / DINOv3).

export const TAG_COLORS = [
  "rose",
  "amber",
  "orange",
  "lime",
  "cyan",
  "blue",
  "slate",
  "stone",
  "indigo",
  "red",
  "fuchsia",
  "yellow",
  "teal",
  "pink",
  "zinc",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** 15 nhóm nhãn chi tiết (ai-service app/tagging/labels.py SECTIONS) → màu. */
export const TAG_SECTION_COLOR: Record<string, TagColor> = {
  people: "rose",
  animals: "amber",
  food: "orange",
  nature: "lime",
  beach: "cyan",
  sky: "blue",
  city: "slate",
  architecture: "stone",
  vehicles: "indigo",
  sports: "red",
  events: "fuchsia",
  home: "yellow",
  tech: "teal",
  fashion: "pink",
  documents: "zinc",
};

/** 17 danh mục (ai-service app/tagging/taxonomy.py) → nhóm gần nhất, để danh mục và nhãn chi tiết cùng chủ đề cùng màu. */
export const TAG_CATEGORY_SECTION: Record<string, string> = {
  portrait: "people",
  group: "people",
  pets: "animals",
  animals: "animals",
  food: "food",
  vehicles: "vehicles",
  sports: "sports",
  beach: "beach",
  mountain: "nature",
  nature: "nature",
  street: "city",
  architecture: "architecture",
  indoor: "home",
  night: "sky",
  sunset: "sky",
  event: "events",
  document: "documents",
};

/**
 * Màu của 1 tag: nhãn chi tiết theo `section` của nó (từ catalog API), danh mục
 * theo `TAG_CATEGORY_SECTION`. Không rõ nhóm → "zinc" (xám).
 */
export function tagColor(tag: string, section?: string | null): TagColor {
  const key = section ?? TAG_CATEGORY_SECTION[tag];
  return (key && TAG_SECTION_COLOR[key]) || "zinc";
}
