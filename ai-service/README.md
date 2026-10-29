# ai-service — The Next Gallery AI Service

A **Python FastAPI** microservice handling **CLIP (OpenCLIP) embeddings** for
**semantic search** and **YOLO26 object detection**.

## Run locally

Dependencies are managed with **[uv](https://docs.astral.sh/uv/)**:
`pyproject.toml` declares them, `uv.lock` pins the exact versions for every
platform (macOS / Linux / Windows). Everyone — and the Docker images — installs
the same versions, so benchmark numbers are reproducible across machines.
Python is **3.12** (same as Docker); uv downloads it automatically if missing.

```bash
# 0. Install uv once:  curl -LsSf https://astral.sh/uv/install.sh | sh   (or: brew install uv)
cd ai-service

# 1. Create .venv (Python 3.12) with runtime + dev deps from uv.lock
uv sync                          # + `--group bench` for the thesis benchmarks (bench/)

# 2. Download YOLO26 weights → models/yolo26n.pt (prints SHA-256 + ultralytics version)
uv run python scripts/download_yolo_weight.py           # or --model yolo26s.pt ...

# 3. Check the GPU backend (Apple Silicon → True)
uv run python -c "import torch; print('mps:', torch.backends.mps.is_available())"

# 4. Run (real models; omit the env vars to run with stub providers)
AI_EMBED_PROVIDER=open_clip AI_OBJECT_PROVIDER=yolo \
  uv run uvicorn app.main:app --reload --port 8000

# Tests (stub providers — no model download)
uv run pytest
```

**Changing dependencies** — never edit versions by hand without re-locking:

```bash
uv add <package>                         # add + lock
uv lock --upgrade-package ultralytics    # bump one package within its range
git add pyproject.toml uv.lock           # always commit both
```

Using an existing conda env instead of `.venv`:
`UV_PROJECT_ENVIRONMENT=$CONDA_PREFIX uv sync --inexact`.

On macOS the lock resolves torch from PyPI (MPS included); on Linux/Docker it
uses CPU-only wheels from the PyTorch index (`[tool.uv.sources]` in
`pyproject.toml`).

> **Apple Silicon (M1/M2/M3):** `AI_*_DEVICE=auto` picks `mps`. Docker on macOS
> runs a Linux VM with **no MPS access** (CPU only), so run benchmarks natively,
> not inside the container. Record the device in every benchmark report.

| Version pin | Why |
|---|---|
| `ultralytics>=8.4.183,<8.5` | YOLO26 was introduced in 8.4.0; current YOLO26 weights require ≥8.4.183. Capped below 8.5 so benchmark numbers stay comparable. |
| `open_clip_torch>=3.3,<4` | 3.x has the SigLIP2 / PE-Core configs; OpenAI weights load via the HF Hub. |
| `requires-python = 3.12` | Same as the Docker images. |

API docs: http://localhost:8000/docs

## Endpoints

| Method | Path              | Description                                     |
|--------|-------------------|-------------------------------------------------|
| GET    | `/health`         | Health check + active providers                  |
| POST   | `/api/v1/detect/objects` | Image file → `ObjectDetectResponse` (YOLO26) |
| POST   | `/api/v1/embed/image` | Image file → embedding vector (CLIP image encoder) |
| POST   | `/api/v1/embed/text`  | `{ "text": "..." }` → embedding vector (CLIP text encoder) |
| POST   | `/api/v1/classify`    | Image + labels → zero-shot softmax probabilities (CLIP) |
| GET    | `/api/v1/embed/info`  | Embedding provider info (provider/model/dimension) |
| GET    | `/`               | Service info                               |

### POST /api/v1/detect/objects

Request: multipart/form-data, field `file` (image, max 10MB).

```json
{
  "provider": "yolo",
  "model": "yolo26n",
  "detections": [
    { "class_name": "dog", "confidence": 0.88, "bbox": [0.03, 0.42, 0.85, 0.94] }
  ]
}
```

`bbox` is `[x1, y1, x2, y2]` normalized to 0–1. See `docs/ai-yolo.md`.

### POST /api/v1/embed/image & /api/v1/embed/text

`embed/image`: multipart/form-data, field `file` (JPEG/PNG/WebP/GIF, max 10MB).
`embed/text`: JSON `{ "text": "dog running on the beach" }` (1–500 chars).

Response (both):
```json
{
  "provider": "open_clip",
  "model": "ViT-B-32",
  "dimension": 512,
  "embedding": [0.013, -0.021, "..."]
}
```

Vectors are L2-normalized. The backend stores image embeddings in the
`media_embeddings` table (pgvector) and uses `1 - (embedding <=> $query)`
(cosine) to find images by description. See `docs/ai-clip.md`.

## Providers (plugin pattern)

`app/providers/` — two groups: **Embedding** implements `EmbeddingProvider`,
**Object detection** implements `ObjectDetectionProvider`. Registered in
`app/providers/__init__.py::get_embedding_provider()` / `get_object_provider()`.

| Provider          | Requirement                                   | Description                            |
|-------------------|-----------------------------------------------|----------------------------------------|
| `stub`            | none                                          | Objects return `[]`; embedding returns a deterministic (unit-norm) vector — runs the skeleton |
| `open_clip`       | `pip install torch torchvision open_clip_torch` | OpenCLIP image/text encoder for semantic search |
| `yolo`            | `pip install ultralytics` + weights (`scripts/download_yolo_weight.py`) | YOLO26 object detection |

To add your own provider: create a class following the matching ABC, add a branch
in the factory, and set `AI_EMBED_PROVIDER`/`AI_OBJECT_PROVIDER=<name>`.

## Env vars

Prefix `AI_` (read from env or the project-root `.env` — same convention as the backend):

| Variable               | Default                     | Meaning                    |
|------------------------|-----------------------------|----------------------------|
| `AI_HOST`              | `0.0.0.0`                   | Bind host                  |
| `AI_PORT`              | `8000`                      | Port                       |
| `AI_EMBED_PROVIDER`    | `stub`                      | `stub` \| `open_clip`      |
| `AI_OBJECT_PROVIDER`   | `stub`                      | `stub` \| `yolo`           |
| `AI_CLIP_MODEL`        | `ViT-B-32`                  | OpenCLIP model name        |
| `AI_CLIP_PRETRAINED`   | `laion2b_s34b_b79k`         | Pretrained tag             |
| `AI_CLIP_DEVICE`       | `auto`                      | `auto` \| `cpu` \| `cuda` \| `mps` |
| `AI_YOLO_WEIGHTS`      | `yolo26n.pt`                | YOLO weights path          |
| `AI_YOLO_DEVICE`       | `auto`                      | `auto` \| `cpu` \| `cuda` \| `mps` |
| `AI_YOLO_CONF`         | `0.25`                      | YOLO confidence threshold  |
| `AI_CORS_ORIGINS`      | `["http://localhost:5173"]` | CORS origins for the web FE |

## Docker

```bash
# Dev — only ai-service (the Docker build downloads CLIP + YOLO weights)
docker compose -f docker-compose.dev.yml --env-file .env up ai-service

# Prod (with the whole stack)
docker compose -f docker-compose.prod.yml --env-file .env up -d ai-service
```

Inside the Docker network the backend reaches it at `http://ai-service:8000`
(internal, not exposed to the host). `docker-compose.dev.yml`/`prod.yml` allow
overriding the providers via the `AI_EMBED_PROVIDER`/`AI_OBJECT_PROVIDER` env vars.

> Dev `--profile full` enables `AI_EMBED_PROVIDER=open_clip` and
> `AI_OBJECT_PROVIDER=yolo` by default (torch is in the image). Prod defaults to
> `stub` — set `AI_EMBED_PROVIDER=open_clip` / `AI_OBJECT_PROVIDER=yolo` in
> `.env` to enable them. Weights are baked at image build time.
