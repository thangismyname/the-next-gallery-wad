// Hiểu truy vấn search (pure, không DB): tìm tên tag nội dung + tên vật thể
// COCO (kèm số lượng: "2 con chó", "two dogs", "犬2匹") trong câu, theo từ điển
// search.lexicon.json (vi / en / ja). Phần còn lại vẫn để CLIP hiểu.
//
// GIỮ KHỚP với ai-service bench/search_eval.py::parse_query (cùng từ điển,
// cùng thuật toán) — bench đo đúng cái app chạy.
import { readFileSync } from "node:fs";

export const LEXICON = JSON.parse(
  readFileSync(new URL("./search.lexicon.json", import.meta.url), "utf8"),
);

const CJK = /[぀-ヿ㐀-鿿]/u;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizeQuery(text) {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// Mọi cách gọi (tag + vật thể, 3 ngôn ngữ), dài trước → "xe đạp" thắng "xe".
const ENTRIES = [];
for (const [kind, table] of [
  ["tag", LEXICON.tags],
  ["object", LEXICON.objects],
]) {
  for (const [id, names] of Object.entries(table)) {
    for (const lang of ["vi", "en", "ja"]) {
      for (const raw of names[lang] ?? []) {
        const term = normalizeQuery(raw);
        const cjk = CJK.test(term);
        // Chữ Latin: khớp nguyên từ (+ số nhiều tiếng Anh); CJK: không có dấu cách.
        const pattern = cjk
          ? escape(term)
          : `(?<![\\p{L}\\p{N}_])${escape(term)}(?:s|es)?(?![\\p{L}\\p{N}_])`;
        ENTRIES.push({ kind, id, term, cjk, regex: new RegExp(pattern, "gu") });
      }
    }
  }
}
ENTRIES.sort((a, b) => b.term.length - a.term.length);

const NUMBER_WORDS = Object.assign(
  {},
  LEXICON.numbers.vi,
  LEXICON.numbers.en,
  LEXICON.numbers.ja,
);
const words = (list) =>
  [...list].sort((a, b) => b.length - a.length).map(escape).join("|");
const LATIN_NUMBER = `\\d+|${words(Object.keys({ ...LEXICON.numbers.vi, ...LEXICON.numbers.en }))}`;
const JA_NUMBER = `\\d+|[${Object.keys(LEXICON.numbers.ja).join("")}]+`;
const JA_UNITS = words(LEXICON.units.ja);
// "2 con chó", "hai chiếc xe đạp", "two dogs" — số (+ lượng từ) ngay trước tên.
const COUNT_BEFORE_LATIN = new RegExp(
  `(?:^|[^\\p{L}\\p{N}_])(${LATIN_NUMBER})\\s*(?:(?:${words(LEXICON.units.vi)})\\s*)?$`,
  "u",
);
// "3匹の犬", "二人" — số (+ lượng từ) (+ の) ngay trước; "犬が2匹" — ngay sau.
const COUNT_BEFORE_JA = new RegExp(`(${JA_NUMBER})(?:${JA_UNITS})?の?\\s*$`, "u");
const COUNT_AFTER_JA = new RegExp(`^\\s*(?:が|は|も)?(${JA_NUMBER})(?:${JA_UNITS})`, "u");

function toNumber(token) {
  if (/^\d+$/.test(token)) return Number(token);
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  // 漢数字 nhiều chữ (十二…) — đủ dùng cho 1–10, còn lại bỏ qua.
  return NUMBER_WORDS[token[0]] ?? null;
}

function countFor(text, start, end, cjk) {
  const before = text.slice(0, start);
  const m =
    before.match(COUNT_BEFORE_LATIN) ??
    before.match(COUNT_BEFORE_JA) ??
    (cjk ? text.slice(end).match(COUNT_AFTER_JA) : null);
  const n = m ? toNumber(m[1]) : null;
  return n && n > 0 && n <= 50 ? n : null;
}

const STOP_LATIN = new Set([
  ...LEXICON.stopwords.vi,
  ...LEXICON.stopwords.en,
  ...LEXICON.units.vi,
  ...Object.keys(LEXICON.numbers.vi),
  ...Object.keys(LEXICON.numbers.en),
]);
const STOP_JA = new RegExp(
  `${words([...LEXICON.stopwords.ja, ...LEXICON.units.ja])}|[${Object.keys(LEXICON.numbers.ja).join("")}]|\\d`,
  "gu",
);
const SPLIT = /[\s,.!?;:()"'、。，]+/u;
// Số ký tự "mang nội dung": bỏ từ dừng, số, lượng từ.
const contentLength = (s) =>
  s
    .split(SPLIT)
    .filter((token) => token && !STOP_LATIN.has(token))
    .map((token) => token.replace(STOP_JA, ""))
    .join("").length;

/**
 * Độ phủ của từ điển: phần câu (bỏ từ không mang nội dung, số, lượng từ) đã
 * được hiểu thành tag / vật thể. 1 = câu được hiểu trọn → search tin tag/YOLO
 * hơn CLIP; 0 = không hiểu gì → chỉ còn CLIP.
 */
function coverage(text, taken) {
  const understood = text.split("").filter((ch, i) => taken[i] && /\S/u.test(ch)).length;
  const leftover = text.split("").map((ch, i) => (taken[i] ? " " : ch)).join("");
  const rest = contentLength(leftover);
  return understood + rest === 0 ? 0 : understood / (understood + rest);
}

/**
 * @returns {{ text: string, tags: string[], objects: { cls: string, count: number | null }[], coverage: number }}
 */
export function parseQuery(query) {
  const text = normalizeQuery(query);
  const taken = new Array(text.length).fill(false);
  const tags = [];
  const objects = new Map();

  for (const entry of ENTRIES) {
    for (const match of text.matchAll(entry.regex)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      taken.fill(true, start, end);
      if (entry.kind === "tag") {
        if (!tags.includes(entry.id)) tags.push(entry.id);
      } else {
        const count = countFor(text, start, end, entry.cjk);
        const prev = objects.get(entry.id);
        objects.set(entry.id, { cls: entry.id, count: prev?.count ?? count });
      }
    }
  }
  return {
    text,
    tags,
    objects: [...objects.values()],
    coverage: tags.length || objects.size ? coverage(text, taken) : 0,
  };
}
