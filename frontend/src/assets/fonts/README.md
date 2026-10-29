# Fonts (local only)

Fonts referenced by the app via `@font-face` in `frontend/src/index.css`:

| File | Used for | In git? |
|------|----------|---------|
| `DFVN-Basteleur-Moonlight.otf` | `--font-heading`, weight ≤ 400 | ✅ SIL OFL (Vietnamese build of Basteleur) |
| `DFVN-Basteleur-Bold.otf` | `--font-heading`, weight ≥ 500 (`font-semibold`) | ✅ SIL OFL |

Product Sans is proprietary and **not committed** (see `.gitignore`):

| File | Used for |
|------|----------|
| `Product Sans Regular.otf` | `--font-sans` (body/UI) |
| `Product Sans Italic.otf` | body/UI italic |
| `Product Sans Bold.otf` | body/UI bold |
| `Product Sans Bold Italic.otf` | body/UI bold italic |

Uppercase labels use `font-mono` = the OS monospace font (no file needed).

## What happens without these files

The `@font-face` sources simply fail to resolve and the UI falls back to
`system-ui` (see the `--font-sans` stack in `frontend/src/index.css`). The app
builds and runs fine — it just uses the system font instead of Product Sans.

## Adding the fonts locally (optional)

Product Sans is proprietary (Google) and is not distributed here. If you own a
license/copy, drop the four `.otf` files listed above into this folder and the
UI will pick them up automatically. These files will stay untracked because the
whole folder is git-ignored.
