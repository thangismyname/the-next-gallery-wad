# Fonts

- `DFVN-Basteleur-*.otf` — SIL OFL, committed.
- `Product Sans*.otf` — proprietary, kept local only (git-ignored). Missing files resolve to an empty module (metro.config.js) and the app falls back to the system font.

## Japanese

| `ZenOldMincho-{Regular,Bold}.ttf` | Japanese headings (kana / kanji — Basteleur has none) | ✅ SIL OFL (`OFL-Zen.txt`) |
| `ZenKakuGothicNew-{Regular,Bold}.ttf` | Japanese body/UI (Product Sans has none) | ✅ SIL OFL |

The Zen files are **subsets** (Latin + kana + every kanji of the `ja` translation, the 174 AI label
names and the search lexicon; 15 MB → ~600 KB woff2). Re-subset after adding many new Japanese
strings: `uvx --from 'fonttools[woff]' pyftsubset <full>.ttf --text-file=<chars> --unicodes=U+0020-007E,U+3000-30FF,U+FF00-FFEF (no --flavor → .ttf)`
(full fonts: github.com/google/fonts `ofl/zenoldmincho`, `ofl/zenkakugothicnew`). Kanji outside the
subset fall back to the system font.

React Native can't fall back glyph by glyph between custom fonts, so `<Text>` / `<Input>` switch the
whole family while the UI language is Japanese (`lib/fonts.ts::useJapaneseFonts` → `fontClasses(…, true)`).
