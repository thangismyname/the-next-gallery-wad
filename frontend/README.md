# frontend — The Next Gallery (web)

React 19 + Vite 8 + TypeScript (strict), Tailwind CSS v4 + shadcn/ui, TanStack Query,
Zustand, react-router 7, i18next (vi · en · ja). Part of the npm-workspaces monorepo:
types, API services, stores, utils and **translations** are shared with the mobile app
through [`packages/shared`](../packages/shared) (`@tng/shared`).

## Scripts (run from `frontend/`, or `npm run <script> --workspace=frontend` from the root)

| Script | What |
|---|---|
| `npm run dev` | Vite dev server on :5173 (reads `../.env`) |
| `npm run build` | `tsc --noEmit` **then** `vite build` — type errors fail the build |
| `npm run typecheck` | type-check only |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`, pure helpers) |
| `npm run preview` | serve the production build |

Install once from the **repo root** (`npm install`) — the workspace links `@tng/shared`.

## Layout (`src/`)

| Folder | What goes there |
|---|---|
| `features/<name>/` | One folder per screen / feature: `<Name>View.tsx`, `components/`, the feature's hooks (`useXxx.ts`) and pure helpers (`xxx.ts` + `xxx.test.ts`) next to it |
| `components/ui/` | shadcn/ui primitives (`npx shadcn@latest add <name>`) — `cn` from `@/lib/utils` |
| `components/layout/` | `MainLayout`, `AdminLayout`, `RouteFallback` |
| `components/motion/`, `components/toggles/` | App-wide motion effects; theme / language toggles |
| `hooks/` | Hooks used by **several** features (selection, gallery actions, signaling, presence, panels…) |
| `services/` | Web-only API code (upload, signaling, transfers, auth client) + re-exports of `@tng/shared` services bound to the web HTTP client |
| `lib/` | Config (`API_URL`…), `cn`, motion presets, AI colours, languages |
| `routes/` | `AppRoutes` (every page is a lazy chunk) + `ProtectedRoute` / `AdminRoute` |
| `utils/` | Web-only helpers (media grouping, theme transition); shared formatters come from `@tng/shared` |

Types, formatters (`formatBytes`…), the selection / grid-density stores and the i18n JSON
live in `packages/shared` — import them from `@tng/shared`.

## Docker

The images are built from the **repo root** (they need `packages/shared`):

```bash
docker compose -f docker-compose.prod.yml --env-file .env build frontend   # context ".", frontend/Dockerfile.prod
```

## Fonts / assets

Headings use DFVN Basteleur (WOFF2, committed); the body font Product Sans is proprietary
and kept local — see `src/assets/fonts/README.md`. Landing images are WebP.
