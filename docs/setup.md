# Setup Guide

How to run **The Next Gallery** locally (dev) and in production.
For an overview of the project and its features, see the [README](../README.md).

## Requirements

- **Docker** + Docker Compose (for PostgreSQL + MinIO)
- **Node.js 20+** (backend + frontend + mobile)
- **Python 3.11–3.12** (only for running ai-service natively; not needed for `stub`)
- `openssl` (to generate a secret)

> Recommended: run **PostgreSQL + MinIO in Docker**, run backend/frontend
> natively (`npm run dev`) for fast hot reload.

## 0. Clone the repository

```bash
git clone <your-repo-url> The_Next_Gallery
cd The_Next_Gallery
```

## 1. Environment file

```bash
cp .env.example .env
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET
```

The root `.env` is shared by the backend, the frontend and the ai-service.
The example file annotates every variable as **[REQUIRED]**, **[SECRET]**,
**[OPTIONAL]** or **[DEFAULT OK]** — check it to see exactly what you must fill in.

Key variables (all defined in the root `.env`):

| Group | Variables |
|-------|-----------|
| Database | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_POOL_SIZE` |
| Object storage | `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_SECURE` |
| Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| OAuth | `GOOGLE_CLIENT_ID`/`SECRET`, `GITHUB_CLIENT_ID`/`SECRET` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| CORS | `CORS_ORIGINS`, `TRUSTED_ORIGINS` |
| AI (backend) | `AI_SERVICE_URL`, `AI_CLIP_MIN_SIM`, `AI_YOLO_MIN_CONF` |
| AI (service) | `AI_EMBED_PROVIDER`, `AI_OBJECT_PROVIDER`, `AI_CLIP_*`, `AI_YOLO_*` |
| Frontend | `VITE_API_URL` (or `VITE_API_BASE_URL`) |
| Production | `PUBLIC_API_BASE_URL`, `PUBLIC_API_BASE_URL_ROOT` |

> **`.env` must be readable by every tool, including the Better Auth CLI.** The CLI
> runs from `backend/` and reads `backend/.env`, so create a symlink (or copy):
>
> ```bash
> ln -s ../.env backend/.env      # macOS / Linux
> # Windows (PowerShell): Copy-Item .env backend/.env
> ```

## 2. Start PostgreSQL + MinIO

```bash
docker compose -f docker-compose.dev.yml --env-file .env up -d postgres minio
```

- PostgreSQL: `localhost:5433`
- MinIO API: `http://localhost:9002` · MinIO Console: `http://localhost:9091`

> When running the **whole stack** with Docker (`--profile full`), compose
> overrides `DB_HOST`/`MINIO_ENDPOINT` with the internal service names — you do
> not need to edit `.env` for that.

## 3. Database tables (automatic)

Nothing to run. On every start the backend (`backend/src/db/migrate.js`):

1. runs the Better Auth migration (`user`, `session`, `account`, `verification`),
2. on an empty database (no `media` table) runs `backend/src/db/schema.sql`
   (every app table),
3. applies the idempotent changes in `migrate.js` for older databases.

If step 1 or 2 fails the server refuses to start (the error is in the log).
`npx @better-auth/cli migrate` still works if you want to run step 1 by hand.

## 4. Run the AI service (optional)

Not needed to run the gallery — with `AI_EMBED_PROVIDER=stub` and
`AI_OBJECT_PROVIDER=stub`, semantic search falls back to filename matching.

**Docker (recommended — torch/CLIP/YOLO are heavy):**

```bash
docker compose -f docker-compose.dev.yml --env-file .env up -d --build ai-service
```

**Native (Python 3.12, managed by [uv](https://docs.astral.sh/uv/)):**

```bash
cd ai-service
uv sync                                           # .venv + exact versions from uv.lock
uv run python scripts/download_clip_weight.py     # OpenCLIP weights
uv run python scripts/download_yolo_weight.py     # YOLO26 weights → models/
uv run uvicorn app.main:app --reload --port 8000
cd ..
```

See [`ai-service/README.md`](../ai-service/README.md) for provider details.

## 5. Run backend + frontend

The web app, the mobile app and `packages/shared` are **npm workspaces** with one
lockfile at the repo root, so install them once from the root. The backend is a
separate package (own `package.json` / lockfile).

```bash
# Terminal 1
cd backend && npm install && npm run dev

# Terminal 2 (repo root)
npm install            # frontend + packages/shared + apps/mobile
npm run dev:web        # = npm run dev --workspace=frontend
```

Open **http://localhost:5173**.

## 6. Run the mobile app (optional, Expo)

```bash
cp apps/mobile/.env.example apps/mobile/.env
# EXPO_PUBLIC_API_URL=http://<Mac LAN IP>:3000/api   ← `ipconfig getifaddr en0`
npm run dev:mobile     # Expo dev server — scan the QR with Expo Go / dev build
```

- iOS simulator can use `localhost`; a **real phone or Android emulator needs the
  Mac's LAN IP** and the same Wi-Fi. The IP changes when you reconnect — if the app
  can't reach the backend, check it first, then restart with `npx expo start -c`
  (`EXPO_PUBLIC_*` is baked into the bundle).
- Add the Expo origin (`http://<LAN IP>:8081`) to `CORS_ORIGINS` / `TRUSTED_ORIGINS`
  for Expo web; native requests use the `tng://` / `exp://` schemes, already trusted.

## Verify the setup

```bash
curl http://localhost:3000/api/health          # backend  → {"success":true,...}
curl http://localhost:8000/health              # ai-service (only if running)
```

- Frontend loads at http://localhost:5173 and you can register an account.
- MinIO Console (http://localhost:9091) logs in with your `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`.
- AI status (after login): `GET /api/gallery/media/embed/status` → `{ total, embedded, pending }`.

## Create the first admin

The admin dashboard is gated by `role = 'admin'` on the `user` row. Register a
normal account in the UI, then promote it directly in the database:

```bash
docker exec -it next_gallery_postgres psql -U postgres -d the_next_gallery_db \
  -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'you@example.com';"
```

Log out and back in, then open the Admin dashboard.

## Enable AI features

1. Set the providers in `.env`:
   ```env
   AI_EMBED_PROVIDER=open_clip    # semantic search + content tags (17 categories, 174 labels)
   AI_OBJECT_PROVIDER=yolo        # object detection
   AI_SIMILARITY_PROVIDER=dinov3  # "Similar photos" — gated weights, see docs/ai-dino.md
   ```
2. Make sure the ai-service is running (step 4), then restart the backend.
3. Backfill media uploaded before AI was enabled:
   ```bash
   cd backend
   npm run backfill:embed     # CLIP embeddings for existing images
   npm run backfill:detect    # YOLO object detection for existing images
   npm run backfill:dino      # DINOv3 similar-photo vectors
   npm run backfill:tags      # 17 categories + 174 detailed labels (needs CLIP vectors)
   npm run backfill:thumbs    # missing thumbnail tiers (photos uploaded before tiers existed)
   npm run backfill:taken-at  # EXIF / video date taken
   ```
   The same batches run from **Settings → AI processing** in the web app.
   New uploads are processed in the background automatically.

## OAuth & email (optional)

- **Google / GitHub sign-in** — create an OAuth app and set the redirect URI to
  `{BETTER_AUTH_URL}/api/auth/callback/{provider}`
  (e.g. `http://localhost:3000/api/auth/callback/google`), then fill
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
- **Password reset email** — set `SMTP_*`. For local testing, a Mailtrap sandbox
  works with the defaults in `.env.example`.

## Common commands

**Backend** (`backend/`)
```bash
npm run dev              # tsx watch (hot reload)
npm start                # production
npm run backfill:embed   # CLIP embeddings for existing images
npm run backfill:detect  # YOLO object detection for existing images
```

**Frontend** (`frontend/`)
```bash
npm run dev      # Vite dev server (:5173)
npm run build    # production build
npm run lint     # oxlint
```

**AI service** (`ai-service/`)
```bash
uvicorn app.main:app --reload --port 8000   # run natively
python scripts/download_clip_weight.py       # download OpenCLIP weights
python scripts/download_yolo_weight.py       # download YOLO26 weights
```

**Docker**
```bash
# Infrastructure only
docker compose -f docker-compose.dev.yml --env-file .env up -d postgres minio

# Whole stack in containers
docker compose -f docker-compose.dev.yml --env-file .env --profile full up --build
```

## Production

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

- Step-by-step on Oracle Cloud Always Free (+ backups, switching to external S3): `docs/deploy-oracle.md`.
- Set `SITE_ADDRESS=<your domain>` and point its DNS at the server; **Caddy obtains HTTPS automatically** (empty = plain HTTP on :80).
- Only **Caddy** is exposed (`80`/`443`); every other service stays on the internal network.
- Set `PUBLIC_API_BASE_URL` and `PUBLIC_API_BASE_URL_ROOT` to your HTTPS URLs
  (e.g. `https://your-domain/api` and `https://your-domain`) and add your domain
  to `CORS_ORIGINS`. `PUBLIC_API_BASE_URL` is also a **build arg** for the
  frontend image, so set it *before* building.

## Troubleshooting

- **Port already in use** — dev ports are `5433` (Postgres), `9002`/`9091` (MinIO),
  `3000` (backend), `5173` (frontend), `8000` (ai-service). Stop the conflicting
  process or change the host mapping.
- **`.env` not loaded** — the backend logs the path it tried. Ensure `.env` is at
  the project root and `backend/.env` symlink/copy exists.
- **Auth errors / `BETTER_AUTH_SECRET`** — the secret must be set and consistent;
  regenerate with `openssl rand -base64 32`.
- **Schema changes not applied** — `schema.sql` only runs on an empty database;
  changes for an existing database must also go into `migrate.js` (idempotent
  DDL). To start from scratch: `docker compose -f docker-compose.dev.yml down -v`.
- **UI uses the system font instead of Product Sans** — the Product Sans `.otf`
  files are proprietary and intentionally **not committed**
  (`frontend/src/assets/fonts/` is git-ignored). The app falls back to
  `system-ui`; this is expected. See
  [`frontend/src/assets/fonts/README.md`](../frontend/src/assets/fonts/README.md)
  to add them locally. A Vite build warning about the unresolved `.otf` url is
  harmless.

## Ports

| Service | Dev (host) | Dev (Docker) | Prod (internal) |
|---------|-----------|-------------|-----------------|
| Frontend | 5173 | 5173 | 80 (Nginx) |
| Backend | 3000 | 3000 | 3000 |
| PostgreSQL | 5433 | 5432 | 5432 |
| MinIO API | 9002 | 9000 | 9000 |
| MinIO Console | 9091 | 9091 | 9001 |
| AI Service | 8000 | 8000 | 8000 |
| Caddy (prod) | — | — | 80/443 |
