# The Next Gallery

A web-based image gallery with **AI-assisted image classification and search** — web app, mobile app
(Expo) and a Python AI service. Photos are tagged automatically (17 categories + 174 detailed labels,
each with a calibrated confidence), searchable by meaning in Vietnamese / English / Japanese, and
grouped into smart and automatic albums. Built as a bachelor thesis project.

## Overview

- **Browse** — virtualized infinite-scroll gallery, WebP thumbnail tiers, HEIC + video support,
  signed streaming URLs (ETag / range requests, immutable cache).
- **Understand** — every upload goes through OpenCLIP (embedding), YOLO26 (objects) and DINOv3
  (visual similarity) in the background; a tagger turns the CLIP vector into categories + labels.
- **Find** — Spotlight hybrid search ("2 con chó trên bãi biển", "two dogs on a beach", "犬が2匹")
  combines CLIP, content tags, detailed labels and YOLO object counts.
- **Organize** — albums (manual, smart rule-based, automatic by type / content / time / objects),
  favorites and personal labels ("To edit", "To print").
- **Share** — public album links, friend circles, Locket-style moments, and Quick send
  (P2P WebRTC → TURN → end-to-end encrypted relay).

## Features

### Media

- Upload photos/videos (HEIC, MOV included), EXIF date taken + rotation, thumbnail tiers (200 / 400 / 2048 px)
- Lightbox with progressive loading, zoom, details panel (AI tags, objects, similar photos, albums, labels)
- Multi-select (long-press / Shift-range), download originals (single file or streamed zip), trash

### AI

- **Content classification** — 17 categories + 174 Open Images labels with confidence, AI Studio page
- **Hybrid search** — CLIP + tags + labels + YOLO counts, multilingual query parser, scoped search
  (favorites / label / album)
- **Object detection** — YOLO26, bounding-box overlay in Developer Mode
- **Similar photos** — DINOv3 (CLIP image↔image fallback)
- Thesis experiments E1–E6 on Open Images V7 (see [`ai-service/experiments/`](ai-service/experiments/README.md))

### Organize

- **Albums** — manual (members with editor / viewer roles, reorder), smart (tag rules or a search query),
  automatic (media type, content tag, month / event, object group)
- **Collections** — Favorites (hearted or labeled) + personal labels, inside the Albums page
- **Public links** — view / download permission, expiry, view limit, revocable

### Social

- **Friends** — requests, search, invite links, online presence
- **Moments** — Locket-style friend feed, collaborative templates, meme wall, emoji reactions
- **Quick send** — friends or anyone via link / QR / 6-char code, no account needed to receive

### Platform

- Web app (React) and **mobile app** (Expo) sharing types, API services and translations (`@tng/shared`)
- Auth (email/password, Google, GitHub), i18n (Vietnamese default, English, Japanese), light/dark theme
- Admin dashboard (KPIs, users, AI system status), Developer Mode (request → admin approval)

## Tech stack

| Layer | Stack |
| --- | --- |
| Web | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Zustand, Framer Motion |
| Mobile | Expo (React Native), expo-router, NativeWind |
| Shared | `@tng/shared` — types, API services, stores, utils, i18n JSON (npm workspace) |
| Backend | Node.js 20 (ES Modules), Express, Better Auth, `pg`, `sharp`, `ffmpeg`, `ws` |
| AI service | Python 3.12 FastAPI (uv), OpenCLIP ViT-B-32, YOLO26 (Ultralytics), DINOv3 ViT-S/16 |
| Data | PostgreSQL 16 + pgvector, MinIO (S3-compatible) |
| Infra | Docker Compose, Caddy (prod reverse proxy), Nginx, coturn (optional TURN) |

## Project structure

```text
The_Next_Gallery/
├── frontend/           React web app (features/*: gallery, albums, favorites, search, studio, moments, share, admin…)
├── apps/mobile/        Expo mobile app
├── packages/shared/    @tng/shared — code shared by web + mobile
├── backend/            Express API (modules/*), WebSocket signaling, AI orchestration, backfill scripts
├── ai-service/         FastAPI AI service (app/) + thesis benchmarks (bench/) + experiments (experiments/)
├── database/
│   ├── pipeline/       schema.dbml (ERD, generated: npm run db:dbml — schema itself: backend/src/db/)
│   └── datasets/       thesis datasets + experiment results (Data/, Classes/, Results/, History/)
└── docs/               setup guide, AI docs, feature specs, git workflow, proposal
```

## Documentation

- [**Setup guide**](docs/setup.md) — requirements, environment, running locally (web, mobile, AI) and in Docker
- [`AGENTS.md`](AGENTS.md) — architecture, conventions, API and feature details
- [`docs/git-workflow.md`](docs/git-workflow.md) — remotes, branches, pull requests
- [`docs/proposal.md`](docs/proposal.md) — project proposal
- AI: [`ai-clip.md`](docs/ai-clip.md) (search + zero-shot) · [`ai-yolo.md`](docs/ai-yolo.md) (detection) ·
  [`ai-dino.md`](docs/ai-dino.md) (similar photos) · [`ai-service/README.md`](ai-service/README.md)
- Thesis evaluation: [`ai-service/experiments/README.md`](ai-service/experiments/README.md) (E1–E6) ·
  [`ai-service/bench/README.md`](ai-service/bench/README.md) (paper reproduction) · results in
  `database/datasets/Results/oi/SUMMARY.md`
- Features: [`share-p2p.md`](docs/features/share-p2p.md) · [`moments.md`](docs/features/moments.md)

## Requirements

Docker (PostgreSQL + MinIO) · Node.js 20+ · Python 3.12 + [uv](https://docs.astral.sh/uv/) (only to run the AI
service natively). See the [setup guide](docs/setup.md) for details.

## Quick start

See the [setup guide](docs/setup.md). In short:

```bash
cp .env.example .env                                   # fill in the [REQUIRED] values
ln -s ../.env backend/.env                             # optional: only for the Better Auth CLI
docker compose -f docker-compose.dev.yml --env-file .env up -d postgres minio
cd backend && npm install && npm run dev               # creates every table on first start
# new terminal, repo root:
npm install && npm run dev:web                         # http://localhost:5173
npm run dev:mobile                                     # optional: Expo app
```

## License

Released under the [MIT License](LICENSE).
