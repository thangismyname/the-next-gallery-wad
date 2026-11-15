import i18n from "i18next";
import { useSyncExternalStore } from "react";

import { FONT } from "./fonts.config";

/**
 * Fonts loaded at startup (root `_layout.tsx` → `useFonts(FONT_SOURCES)`).
 * Product Sans files may be absent (proprietary, git-ignored): Metro then resolves
 * them to an empty module (see metro.config.js), they are dropped here, and React
 * Native falls back to the system font for that family.
 */
const sources: Record<string, unknown> = {
  [FONT.sans]: require("../../assets/fonts/Product Sans Regular.otf"),
  [FONT.sansBold]: require("../../assets/fonts/Product Sans Bold.otf"),
  [FONT.heading]: require("../../assets/fonts/DFVN-Basteleur-Moonlight.otf"),
  [FONT.headingBold]: require("../../assets/fonts/DFVN-Basteleur-Bold.otf"),
  [FONT.sansJa]: require("../../assets/fonts/ZenKakuGothicNew-Regular.ttf"),
  [FONT.sansJaBold]: require("../../assets/fonts/ZenKakuGothicNew-Bold.ttf"),
  [FONT.headingJa]: require("../../assets/fonts/ZenOldMincho-Regular.ttf"),
  [FONT.headingJaBold]: require("../../assets/fonts/ZenOldMincho-Bold.ttf"),
};

// A bundled asset is a number (asset id) on native, a string/object on web; an
// empty module is `{}` with no `uri`.
const isAsset = (src: unknown) =>
  typeof src === "number" ||
  typeof src === "string" ||
  (typeof src === "object" && src !== null && "uri" in src);

export const FONT_SOURCES = Object.fromEntries(
  Object.entries(sources).filter(([, src]) => isAsset(src)),
) as Record<string, number>;

export { FONT };

const HAS_SANS = FONT.sans in FONT_SOURCES && FONT.sansBold in FONT_SOURCES;
const HAS_HEADING = FONT.heading in FONT_SOURCES && FONT.headingBold in FONT_SOURCES;
const HAS_JA =
  FONT.sansJa in FONT_SOURCES &&
  FONT.sansJaBold in FONT_SOURCES &&
  FONT.headingJa in FONT_SOURCES &&
  FONT.headingJaBold in FONT_SOURCES;

// Current UI language — Text re-renders when it changes (useSyncExternalStore), even
// when its own props are memoized (React Compiler) and its text isn't translated.
const subscribeLanguage = (onChange: () => void) => {
  i18n.on("languageChanged", onChange);
  return () => i18n.off("languageChanged", onChange);
};
/** true while the UI is Japanese → `fontClasses(…, true)` picks the Zen fonts. */
export function useJapaneseFonts() {
  return useSyncExternalStore(subscribeLanguage, () => HAS_JA && i18n.language === "ja");
}
const HEADING = /(^|\s)font-heading(\s|$)/;
const BOLD = /(^|\s)font-(medium|semibold|bold|extrabold|black)(\s|$)/;

/**
 * Picks the font file for a merged className, mirroring the web rule: weight ≥ 500
 * → the Bold file, otherwise Regular/Moonlight. React Native can't do this itself
 * (one file = one family). The weight class is then reset to `font-normal` so
 * Android doesn't synthesize bold on top of an already-bold file. When the family's
 * files are missing the className is left alone → system font with its own weights.
 * `japanese` (from `useJapaneseFonts()`) → the Zen pair instead: React Native can't fall
 * back glyph by glyph between custom fonts like the web font stack does, so the whole
 * family switches with the language. Rare kanji outside the subset → system font.
 * Used by `<Text>` and `<Input>`; returns extra classes to append.
 */
export function fontClasses(className: string, japanese = false): string {
  const heading = HEADING.test(className);
  const bold = BOLD.test(className);
  if (japanese) {
    const family = heading
      ? bold ? "font-heading-ja-bold" : "font-heading-ja"
      : bold ? "font-sans-ja-bold" : "font-sans-ja";
    return `${family} font-normal`;
  }
  if (heading ? !HAS_HEADING : !HAS_SANS) return "";
  const family = heading
    ? bold ? "font-heading-bold" : "font-heading"
    : bold ? "font-sans-bold" : "font-sans";
  return `${family} font-normal`;
}
