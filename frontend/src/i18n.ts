import i18n, { type BackendModule, type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import translationVI from "@tng/shared/i18n/locales/vi/translation.json";
import { LANGUAGES, type LanguageCode } from "@tng/shared";

// Bản dịch dùng chung với app mobile (packages/shared). Thêm ngôn ngữ: tạo
// locales/<code>/translation.json, thêm 1 dòng vào LOCALES + 1 dòng trong lib/languages.ts.
// Chỉ "vi" (mặc định + fallback) nằm trong bundle chính; ngôn ngữ khác là chunk riêng,
// tải khi được chọn / dò ra (~60 KB mỗi file — không bắt ai cũng tải hết).
const LOCALES: Record<LanguageCode, () => Promise<{ default: object }>> = {
  vi: () => Promise.resolve({ default: translationVI }),
  en: () => import("@tng/shared/i18n/locales/en/translation.json"),
  ja: () => import("@tng/shared/i18n/locales/ja/translation.json"),
  zh: () => import("@tng/shared/i18n/locales/zh/translation.json"),
};

const lazyLocales: BackendModule = {
  type: "backend",
  init: () => {},
  read: (lng, _ns, done) => {
    const load = LOCALES[lng as LanguageCode];
    if (!load) return done(null, {});
    load().then(
      (m) => done(null, m.default as ResourceKey),
      (err: Error) => done(err, null),
    );
  },
};

void i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { vi: { translation: translationVI } },
    partialBundledLanguages: true, // vi bundled, the rest through `lazyLocales`
    fallbackLng: "vi", // ngôn ngữ dùng khi không phát hiện được hoặc thiếu key
    // Chỉ nhận ngôn ngữ có trong LANGUAGES; "ja-JP" / "en-US" → "ja" / "en".
    supportedLngs: LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    detection: {
      // Thứ tự dò: ?lang=en → localStorage → cookie → trình duyệt → <html lang>
      order: ["querystring", "localStorage", "cookie", "navigator", "htmlTag"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "app_language",
      lookupCookie: "i18next",
      // Lưu lại khi gọi i18n.changeLanguage()
      caches: ["localStorage", "cookie"],
      cookieMinutes: 10080, // 7 ngày
    },
    interpolation: { escapeValue: false },
  });

// <html lang> theo ngôn ngữ đang dùng: trình đọc màn hình + chọn font CJK đúng (index.css `:lang(zh)`).
const syncHtmlLang = (lng?: string) => {
  if (lng) document.documentElement.lang = lng;
};
syncHtmlLang(i18n.resolvedLanguage);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
