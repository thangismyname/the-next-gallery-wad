// Font family names registered with expo-font (src/lib/fonts.ts) — shared by
// tailwind.config.js (CommonJS) and the app. Same fonts as the web
// (frontend/src/index.css): Product Sans = body/UI, DFVN Basteleur = headings
// (Moonlight ≤ 400, Bold ≥ 500). Japanese UI → Zen Kaku Gothic New (body) +
// Zen Old Mincho (headings) — neither Latin font has kana / kanji (SIL OFL, subset).
const FONT = {
  sans: "ProductSans-Regular",
  sansBold: "ProductSans-Bold",
  heading: "DFVNBasteleur-Moonlight",
  headingBold: "DFVNBasteleur-Bold",
  sansJa: "ZenKakuGothicNew-Regular",
  sansJaBold: "ZenKakuGothicNew-Bold",
  headingJa: "ZenOldMincho-Regular",
  headingJaBold: "ZenOldMincho-Bold",
};

module.exports = { FONT };
