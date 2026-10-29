// Danh sách ngôn ngữ giao diện — thêm ngôn ngữ mới: tạo locales/<code>/
// translation.json, đăng ký trong i18n.js rồi thêm 1 dòng ở đây.
export const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", short: "VI" },
  { code: "en", label: "English", short: "EN" },
  { code: "ja", label: "日本語", short: "JA" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** "ja-JP" → "ja"; ngôn ngữ lạ → "vi" (fallback). */
export function toLanguageCode(lng?: string | null): LanguageCode {
  const base = lng?.split("-")[0];
  return LANGUAGES.find((l) => l.code === base)?.code ?? "vi";
}
