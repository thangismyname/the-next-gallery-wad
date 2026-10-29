// Phạm vi tìm kiếm Spotlight ("Tìm trong Yêu thích / 1 nhãn / 1 album") —
// hàm thuần: gợi ý phạm vi theo chữ đang gõ + tách cú pháp tắt "favorite.dog".
import type { LabelColor } from "@/services/labels";

export type ScopeKind = "favorites" | "label" | "album" | "edited";

export interface SearchScope {
  /** Gửi lên API (`scope=`): favorites | label:<id> | album:<id>. */
  key: string;
  kind: ScopeKind;
  name: string;
  color?: LabelColor;
  /** Chưa có tính năng (ảnh sau chỉnh sửa — AI Studio Editing). */
  disabled?: boolean;
  /** Từ gõ để gọi ra phạm vi (đã chuẩn hoá). */
  aliases: string[];
}

/** Bỏ dấu tiếng Việt + chữ thường: "Yêu thích" → "yeu thich". */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();

// Gọi ra phạm vi bằng mọi ngôn ngữ, không phụ thuộc ngôn ngữ đang chọn.
const FAVORITE_ALIASES = ["favorite", "favorites", "fav", "yeu thich", "tim", "お気に入り", "heart"];
const EDITED_ALIASES = ["edited", "edit", "chinh sua", "ai studio", "studio", "編集"];

export function buildScopes(input: {
  favoritesName: string;
  editedName: string;
  /** `aliases`: tên thêm để gọi ra (nhãn gợi ý = tên ở mọi ngôn ngữ). */
  labels: { id: string; name: string; color: LabelColor; aliases?: string[] }[];
  albums: { id: string; name: string }[];
}): SearchScope[] {
  return [
    {
      key: "favorites",
      kind: "favorites",
      name: input.favoritesName,
      aliases: [...FAVORITE_ALIASES, normalize(input.favoritesName)],
    },
    ...input.labels.map((l) => ({
      key: `label:${l.id}`,
      kind: "label" as const,
      name: l.name,
      color: l.color,
      aliases: [...new Set([l.name, ...(l.aliases ?? [])].map(normalize))],
    })),
    ...input.albums.map((a) => ({
      key: `album:${a.id}`,
      kind: "album" as const,
      name: a.name,
      aliases: [normalize(a.name)],
    })),
    {
      key: "edited",
      kind: "edited",
      name: input.editedName,
      disabled: true,
      aliases: [...EDITED_ALIASES, normalize(input.editedName)],
    },
  ];
}

/**
 * Phạm vi khớp chữ đang gõ (≥ 2 ký tự, khớp đầu từ của alias). Yêu thích /
 * nhãn trước, album sau; tối đa `max`.
 */
export function suggestScopes(query: string, scopes: SearchScope[], max = 5) {
  const q = normalize(query.split(".")[0] ?? "");
  if (q.length < 2) return [];
  return scopes
    .filter((s) => s.aliases.some((a) => a.startsWith(q) || a.split(" ").some((w) => w.startsWith(q))))
    .slice(0, max);
}

/**
 * Cú pháp tắt "favorite.dog" / "in ảnh.chó": phần trước dấu chấm trùng đúng 1
 * phạm vi → { scope, rest }. Không khớp → null (dấu chấm giữ nguyên trong câu).
 */
export function parseScopedQuery(query: string, scopes: SearchScope[]) {
  const dot = query.indexOf(".");
  if (dot <= 0) return null;
  const head = normalize(query.slice(0, dot));
  const scope = scopes.find((s) => !s.disabled && s.aliases.includes(head));
  return scope ? { scope, rest: query.slice(dot + 1).trimStart() } : null;
}
