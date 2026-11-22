import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@tng/shared/i18n/locales/en/translation.json";
import ja from "@tng/shared/i18n/locales/ja/translation.json";
import vi from "@tng/shared/i18n/locales/vi/translation.json";
import zh from "@tng/shared/i18n/locales/zh/translation.json";
import { LANGUAGES, toLanguageCode, type LanguageCode } from "@tng/shared";
import i18n, { changeLanguage, use as registerPlugin } from "i18next";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "tng.language";

void registerPlugin(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  supportedLngs: LANGUAGES.map((l) => l.code),
  lng: "vi",
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
});

// Restore the user's choice (Vietnamese by default, like the web).
void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (saved && saved !== i18n.language) void changeLanguage(toLanguageCode(saved));
});

/** Switch the UI language and remember it. */
export function setLanguage(code: LanguageCode) {
  void changeLanguage(code);
  void AsyncStorage.setItem(STORAGE_KEY, code);
}

export default i18n;
