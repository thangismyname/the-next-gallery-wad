// Ngày trong câu tìm kiếm Spotlight (vi / en / ja / zh) → bộ lọc { year?, month?, day? } + phần chữ còn lại.
//   "2026" · "năm 2026" · "2026年"                      → năm
//   "tháng 3 2026" · "03/2026" · "2026-03" · "March 2026" · "2026年3月" → tháng của năm
//   "tháng 3" · "March" · "3月"                         → tháng 3 của mọi năm
//   "19/11/2026" · "2026-11-19" · "ngày 19 tháng 11 năm 2026" · "Nov 19, 2026" · "2026年11月19日" → 1 ngày
//   "19/11" · "19 tháng 11" · "Nov 19" · "11月19日"     → ngày đó của mọi năm
// "a/b": ngày/tháng (kiểu VN) trừ khi a ≤ 12 < b thì là tháng/ngày (kiểu US). Thuần, không DB.

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH = `(${Object.keys(MONTHS).join("|")})\\.?`;
const YEAR = "((?:19|20)\\d{2})";
const D = "(\\d{1,2})";
const ORD = "(?:st|nd|rd|th)?";
const END = "(?![\\d/.:-])"; // không ăn nửa số ("2026" ≠ "20" + "26", "10:30" không phải ngày)
const START = "(?<![\\d/.:-])";

const num = (s) => (s == null ? undefined : Number(s));
const month = (s) => MONTHS[s.toLowerCase()];
/** a/b không năm → [ngày, tháng] (ưu tiên kiểu VN). */
const dayMonth = (a, b) => (a <= 12 && b > 12 ? [b, a] : [a, b]);

// Thứ tự = cụ thể trước (ngày đủ) → chung sau (năm trơn). Mỗi mẫu trả { year, month, day } hoặc null.
const PATTERNS = [
  [`${START}${YEAR}-${D}-${D}${END}`, (m) => ({ year: num(m[1]), month: num(m[2]), day: num(m[3]) })],
  [`${START}${D}[/.-]${D}[/.-]${YEAR}${END}`, (m) => {
    const [day, mon] = dayMonth(num(m[1]), num(m[2]));
    return { year: num(m[3]), month: mon, day };
  }],
  [`${YEAR}\\s*年\\s*${D}\\s*月\\s*${D}\\s*[日号號]?`, (m) => ({ year: num(m[1]), month: num(m[2]), day: num(m[3]) })],
  [`${YEAR}\\s*年\\s*${D}\\s*月(?!\\s*\\d)`, (m) => ({ year: num(m[1]), month: num(m[2]) })],
  [`${START}${D}\\s*月\\s*${D}\\s*[日号號]`, (m) => ({ month: num(m[1]), day: num(m[2]) })],
  [`(?:ngày\\s*)?${START}${D}\\s*tháng\\s*${D}(?!\\d)(?:\\s*(?:năm|[/,-])?\\s*${YEAR}${END})?`, (m) => ({
    year: num(m[3]), month: num(m[2]), day: num(m[1]),
  })],
  [`tháng\\s*${D}(?!\\d)(?:\\s*(?:năm|[/,-])?\\s*${YEAR}${END})?`, (m) => ({ year: num(m[2]), month: num(m[1]) })],
  [`${START}${D}${ORD}\\s+(?:of\\s+)?${MONTH}${END}(?:,?\\s+${YEAR}${END})?`, (m) => ({
    year: num(m[3]), month: month(m[2]), day: num(m[1]),
  })],
  [`${MONTH}\\s+${D}${ORD}${END}(?:,?\\s+${YEAR}${END})?`, (m) => ({ year: num(m[3]), month: month(m[1]), day: num(m[2]) })],
  [`${MONTH}(?:\\s+(?:of\\s+)?${YEAR}${END})?`, (m) => {
    // "may" trơn là chữ thường gặp ("may" = có thể) → chỉ nhận khi có năm
    if (m[1].toLowerCase() === "may" && !m[2]) return null;
    return { year: num(m[2]), month: month(m[1]) };
  }],
  [`${START}${YEAR}-${D}${END}`, (m) => ({ year: num(m[1]), month: num(m[2]) })],
  [`${START}${D}[/.-]${YEAR}${END}`, (m) => ({ year: num(m[2]), month: num(m[1]) })],
  [`${START}${D}/${D}${END}`, (m) => {
    const [day, mon] = dayMonth(num(m[1]), num(m[2]));
    return { month: mon, day };
  }],
  [`${D}\\s*月(?!\\s*\\d)`, (m) => ({ month: num(m[1]) })],
  [`(?:năm\\s*)?${START}${YEAR}${END}\\s*年?`, (m) => ({ year: num(m[1]) })],
].map(([source, build]) => [new RegExp(source, "iu"), build]);

// Từ nối còn sót lại cạnh ngày ("ảnh chó vào tháng 3" → "ảnh chó"): bỏ ở đầu / cuối phần còn lại.
const CONNECTORS = /^(?:in|on|from|of|at|vào|trong|ngày|của|lúc|の|在)\s+|\s+(?:in|on|from|of|at|vào|trong|ngày|của|lúc|の|在)$/giu;

function valid({ year, month, day }) {
  if (month != null && (month < 1 || month > 12)) return false;
  if (day == null) return true;
  if (day < 1) return false;
  // năm không rõ → cho phép 29/2
  const max = new Date(Date.UTC(year ?? 2024, month ?? 1, 0)).getUTCDate();
  return day <= max;
}

/**
 * @param {string} query
 * @returns {{ year?: number, month?: number, day?: number, rest: string, text: string } | null}
 *   null = câu không có ngày. `rest` = phần chữ còn lại (rỗng = chỉ tìm theo ngày), `text` = đoạn đã khớp.
 */
export function parseDateQuery(query) {
  const q = String(query ?? "").normalize("NFC");
  for (const [re, build] of PATTERNS) {
    const m = re.exec(q);
    if (!m) continue;
    const date = build(m);
    if (!date || !valid(date)) continue;
    let rest = `${q.slice(0, m.index)} ${q.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
    for (let prev = null; prev !== rest; ) {
      prev = rest;
      rest = rest.replace(CONNECTORS, "").trim();
    }
    const out = Object.fromEntries(Object.entries(date).filter(([, v]) => v != null));
    return { ...out, rest, text: m[0].trim() };
  }
  return null;
}
