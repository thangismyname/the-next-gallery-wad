import { type LabelColor } from "@tng/shared";
// Phạm vi tìm kiếm Spotlight ("Tìm trong Yêu thích / 1 nhãn / 1 album") —
// hàm thuần: gợi ý phạm vi theo chữ đang gõ + tách cú pháp tắt "favorite.dog".

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
  /** Từ gợi ý phụ (tên màu của nhãn) — chỉ để gợi ý, không dùng cho cú pháp "x.dog". */
  hints?: string[];
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

// Tên màu (vi / en / ja) → nhãn có màu đó: gõ "đỏ", "red", "赤" là ra các nhãn
// màu rose mà không cần nhớ tên nhãn. "xanh" (vi) vừa là lá vừa là dương.
// Đổi LABEL_COLORS (services/labels.ts) thì thêm màu ở đây.
const COLOR_ALIASES: Record<LabelColor, string[]> = {
  slate: ["gray", "grey", "slate", "xám", "ghi", "灰色", "はいいろ", "グレー"],
  rose: ["red", "pink", "rose", "đỏ", "hồng", "赤", "あか", "ピンク"],
  amber: ["yellow", "orange", "amber", "gold", "vàng", "cam", "黄色", "きいろ", "オレンジ"],
  emerald: ["green", "emerald", "xanh", "xanh lá", "xanh lục", "lục", "緑", "みどり", "グリーン"],
  sky: ["blue", "sky", "cyan", "xanh", "xanh dương", "xanh da trời", "lam", "青", "あお", "水色", "ブルー"],
  violet: ["purple", "violet", "tím", "紫", "むらさき", "パープル"],
};

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
      hints: COLOR_ALIASES[l.color]?.map(normalize) ?? [],
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

const matchesWord = (words: string[], q: string) =>
  words.some((a) => a.startsWith(q) || a.split(" ").some((w) => w.startsWith(q)));

/**
 * Phạm vi khớp chữ đang gõ (≥ 2 ký tự, khớp đầu từ của alias; chữ CJK ≥ 1 ký
 * tự — "赤"). Khớp tên trước, khớp màu nhãn sau; trong mỗi nhóm Yêu thích /
 * nhãn trước, album sau; tối đa `max`.
 */
export function suggestScopes(query: string, scopes: SearchScope[], max = 5) {
  const q = normalize(query.split(".")[0] ?? "");
  if (q.length < 2 && !/[\u3040-\u9fff]/.test(q)) return [];
  const byName = scopes.filter((s) => matchesWord(s.aliases, q));
  const byColor = scopes.filter((s) => !byName.includes(s) && matchesWord(s.hints ?? [], q));
  return [...byName, ...byColor].slice(0, max);
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
