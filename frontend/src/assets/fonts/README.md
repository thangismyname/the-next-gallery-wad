# Fonts (local only)

Fonts referenced by the app via `@font-face` in `frontend/src/index.css`:

| File | Used for | In git? |
|------|----------|---------|
| `DFVN-Basteleur-Moonlight.woff2` | `--font-heading`, weight ≤ 400 | ✅ SIL OFL (Vietnamese build of Basteleur) |
| `DFVN-Basteleur-Bold.woff2` | `--font-heading`, weight ≥ 500 (`font-semibold`) | ✅ SIL OFL |
| `ZenOldMincho-{Regular,Bold}.woff2` | Japanese headings (kana / kanji — Basteleur has none) | ✅ SIL OFL (`OFL-Zen.txt`) |
| `ZenKakuGothicNew-{Regular,Bold}.woff2` | Japanese body/UI (Product Sans has none) | ✅ SIL OFL |

The Zen files are **subsets** (Latin + kana + every kanji of the `ja` translation, the 174 AI label
names and the search lexicon; 15 MB → ~600 KB woff2). Re-subset after adding many new Japanese
strings: `uvx --from 'fonttools[woff]' pyftsubset <full>.ttf --text-file=<chars> --unicodes=U+0020-007E,U+3000-30FF,U+FF00-FFEF --flavor=woff2`
(full fonts: github.com/google/fonts `ofl/zenoldmincho`, `ofl/zenkakugothicnew`). Kanji outside the
subset fall back to the system font.

Web: the Zen `@font-face`s have a CJK `unicode-range` and sit after the Latin font in
`--font-heading` / `--font-sans`, so the browser falls back glyph by glyph and only downloads
them on pages that contain Japanese.

Product Sans is proprietary and **not committed** (see `.gitignore`):

| File | Used for |
|------|----------|
| `Product Sans Regular.woff2` | `--font-sans` (body/UI) |
| `Product Sans Italic.woff2` | body/UI italic |
| `Product Sans Bold.woff2` | body/UI bold |
| `Product Sans Bold Italic.woff2` | body/UI bold italic |

Uppercase labels use `font-mono` = the OS monospace font (no file needed).

## What happens without these files

The `@font-face` sources simply fail to resolve and the UI falls back to
`system-ui` (see the `--font-sans` stack in `frontend/src/index.css`). The app
builds and runs fine — it just uses the system font instead of Product Sans.

## Adding the fonts locally (optional)

Product Sans is proprietary (Google) and is not distributed here. If you own a
license/copy, drop the four files listed above into this folder and the UI will pick
them up automatically. Fonts are served as **WOFF2** (~60% smaller than OTF/TTF);
convert an `.otf` with:

```bash
uvx --from fonttools --with brotli fonttools ttLib.woff2 compress "Product Sans Regular.otf"
``` These files will stay untracked because the
whole folder is git-ignored.
