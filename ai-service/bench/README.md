# bench/ — offline model benchmarks (thesis reproduction)

Runs the ai-service models **outside the HTTP service** on public datasets and
compares the numbers with the published results:

| Paper / source | What is reproduced | Script |
|---|---|---|
| YOLOv10 (Wang et al., NeurIPS 2024) — Table 1 | COCO val2017 AP, NMS-free vs NMS; batch-1 latency | `yolo_coco_val.py`, `yolo_latency.py` |
| YOLO26 (Ultralytics docs) | same protocol → YOLO26 vs YOLOv10 | `yolo_coco_val.py`, `yolo_latency.py` |
| Ultralytics Benchmark mode | mAP + speed per export format (PyTorch, ONNX) | `yolo_export_benchmark.py` |
| CLIP (Radford et al., ICML 2021) — Tables 11 & 13 | zero-shot retrieval (COCO, Flickr30k), zero-shot classification (CIFAR) | `clip_eval.py` |
| Thesis Form §2 + §6 — classification / tagging | 17 gallery tags: zero-shot vs linear probe (CLIP / DINOv3 / YOLO) vs YOLO26n-cls fine-tune | `cls_eval.py`, `cls_yolo_finetune.py`, `cls_prelabel.py` |
| DINOv3 (Siméoni et al., Meta 2025) — Table 14 | instance retrieval Revisited Oxford (Ox.-H) + Paris, DINOv3 vs DINOv2 vs CLIP of the app | `dino_retrieval.py` |
| Thesis contribution — compositional search | Spotlight search: CLIP-only vs tag + YOLO vs hybrid, Vietnamese / English / Japanese, monolingual vs multilingual CLIP | `search_eval.py` |

Published reference numbers live in `published.py` (with their source).
`report.py` turns all result CSVs into comparison tables (Markdown / LaTeX).

## Setup (once)

```fish
cd ai-service
uv sync --group bench                                   # exact versions from uv.lock
set -x TNG_DATASETS ~/Documents/Study/Thesis/Datasets   # bash/zsh: export TNG_DATASETS=...
```

Datasets live outside the repo under `$TNG_DATASETS` (default `~/datasets`;
every script also accepts `--data-root`). Every command below runs from
`ai-service/` through `uv run`. Ultralytics auto-install is disabled
(`YOLO_AUTOINSTALL=False`) so runs never change the environment.

## Datasets

```text
$TNG_DATASETS/
├── coco/                      # YOLO — COCO val2017 (already prepared)
│   ├── images/val2017/        # 5000 images
│   ├── labels/val2017/        # YOLO labels
│   ├── annotations/instances_val2017.json
│   └── coco-val2017.yaml      # created by `python -m bench.download_coco`
├── revisitop/                 # DINOv3 — Revisited Oxford/Paris
│   ├── roxford5k/{jpg/*.jpg, gnd_roxford5k.pkl}   ~1.8 GB · 4993 db images, 70 queries
│   └── rparis6k/{jpg/*.jpg, gnd_rparis6k.pkl}     ~2.4 GB · 6322 db images, 70 queries
├── places365/                 # Classification T1 — Places365 val (small 256 px)
│   ├── categories_places365.txt, places365_val.txt
│   └── val_256/*.jpg          # 36,500 images, ~0.5 GB
├── gallery-gt/                # Classification — YOUR photos + labels.json (pre-label → review)
├── cls_cache/                 # feature cache written by cls_eval / cls_prelabel (safe to delete)
└── clip_benchmark/            # CLIP — CLIP_benchmark webdatasets (HuggingFace)
    ├── mscoco_captions/test/*.tar          ~840 MB  (5k images, 25k captions)
    ├── flickr30k/test/*.tar                ~146 MB  (1k images, 5k captions)
    ├── cifar10/{test/*.tar, classnames.txt, zeroshot_classification_templates.txt}    ~56 MB
    ├── cifar100/{...same...}                                                         ~56 MB
    └── imagenetv2/{...same...}            ~1.3 GB  (optional)
```

COCO for YOLO: `coco2017labels.zip` (Ultralytics assets) + `val2017.zip`
(images.cocodataset.org); unzip as above, then `uv run python -m bench.download_coco`
to verify and write the yaml.

CLIP datasets (only the `test` split is needed):

```fish
set D $TNG_DATASETS/clip_benchmark
uv run hf download clip-benchmark/wds_mscoco_captions --repo-type dataset --include "test/*" --local-dir $D/mscoco_captions
uv run hf download clip-benchmark/wds_flickr30k       --repo-type dataset --include "test/*" --local-dir $D/flickr30k
for c in cifar10 cifar100
    uv run hf download clip-benchmark/wds_vtab-$c --repo-type dataset \
        --include "test/*" --include "*.txt" --local-dir $D/$c
end
# optional: clip-benchmark/wds_imagenetv2 → $D/imagenetv2 (same flags as cifar)
```

Browser alternative: `https://huggingface.co/datasets/clip-benchmark/<repo>/tree/main`
— download the `test/*.tar` shards (+ `classnames.txt`,
`zeroshot_classification_templates.txt` for classification) into the layout above.

## 1. YOLOv10 reproduction — COCO val2017 AP

```fish
uv run python -m bench.yolo_coco_val --models yolov10n yolov10s yolov10m --modes e2e nms
```

| Mode | Ultralytics | YOLOv10 paper | YOLO26 docs |
|---|---|---|---|
| `e2e` | `nms=False` — one-to-one head | main AP (NMS-free) | "mAPval 50-95(e2e)" |
| `nms` | `nms=None` — one-to-many head + NMS (default of `val`) | AP† | "mAPval 50-95" |

Ultralytics validates **both** families with the one-to-many head + NMS by
default; the YOLOv10 paper's headline AP is NMS-free, hence `--modes e2e`.

Output `results/yolo_coco_val2017.csv`: `coco_map50_95` (pycocotools, the
official COCO evaluator, all 5000 images — compare this one),
`ultra_map50_95` (Ultralytics' metric), `published_map50_95`,
`delta_vs_published`, weights SHA-256, library versions, hardware.

Smoke test (200 images, separate `*_smoke.csv`, not comparable):
`uv run python -m bench.yolo_coco_val --models yolov10n --modes e2e --limit 200`

## 2. YOLO26 vs YOLOv10

Same script, same protocol, then the latency run for both families:

```fish
uv run python -m bench.yolo_coco_val --models yolo26n yolo26s yolo26m --modes e2e nms
uv run python -m bench.yolo_latency                       # v10 n/s/m + 26 n/s/m × e2e/nms on mps
uv run python -m bench.yolo_latency --models yolov10n yolo26n --devices cpu   # optional CPU
```

`yolo_latency.py` checks the YOLOv10 paper's main claim (removing NMS lowers
end-to-end latency) with the paper's protocol on this machine: batch 1, 640 px,
images preloaded in RAM (no I/O), warmup, MPS synchronised before timing.
`model_mean_ms` = inference + post-processing (the end-to-end model latency);
`wall_mean_ms` also includes pre-processing. Published latencies are T4
TensorRT FP16 — different hardware, compare ratios only.

## 3. Ultralytics Benchmark mode (how Ultralytics measures YOLO26)

`yolo_export_benchmark.py` wraps `ultralytics.utils.benchmarks.benchmark()`:
export → test predict → `val` with **batch 1** → mAP50-95, ms/image, FPS, size.

```fish
uv run python -m bench.yolo_export_benchmark --models yolov10n yolo26n --limit 500   # fast
uv run python -m bench.yolo_export_benchmark --models yolo26n --formats onnx         # full 5000
```

Formats: `pytorch-mps`, `pytorch-cpu`, `onnx` (ONNX Runtime CPU — compare with
the docs' "Speed CPU ONNX" column). CoreML is not enabled: `coremltools`
requires `numpy<=2.3.5`, which conflicts with `uv.lock`. With `--limit`, mAP is
not comparable with the published numbers.

## 4. CLIP — zero-shot retrieval & classification

Uses the **app's own provider** (`app/providers/clip.py`), so matching numbers
also validate the service implementation.

```fish
uv run python -m bench.clip_eval              # 5 models × COCO, Flickr30k, CIFAR-10/100
uv run python -m bench.clip_eval --models ViT-B-32:openai --datasets cifar10 --limit 500   # smoke
```

Default models: `ViT-B-32`, `ViT-B-16`, `ViT-L-14`, `ViT-L-14-336` (OpenAI
weights — the paper), `ViT-B-32:laion2b_s34b_b79k` (the app's model). Weights
download on first use into the Hugging Face cache.

| Paper | Compare with |
|---|---|
| Table 13 — retrieval (COCO 5k, Flickr30k 1k), model "CLIP" = ViT-L/14@336px | `ViT-L-14-336:openai`, best with `--caption-prefix "a photo of"` (the paper prepends it) |
| Table 11 — zero-shot top-1 (CIFAR-10/100), per model | `--prompts ensemble` (default) |

Ablations:

```fish
# prompt engineering / ensembling (paper: ensembling +3.5% on ImageNet, ~5% with prompt engineering)
uv run python -m bench.clip_eval --models ViT-B-32:openai --datasets cifar10 cifar100 --prompts ensemble single classname
# caption prefix (paper: +1–2 R@1) and the app's image pipeline (Step 3)
uv run python -m bench.clip_eval --models ViT-B-32:laion2b_s34b_b79k --datasets mscoco_captions \
    --caption-prefix none "a photo of" --image-preprocess raw backend
```

`--image-preprocess backend` reproduces the backend's image path before
embedding (EXIF rotate → longest side ≤512 px → WebP quality 80).

Outputs: `results/clip_retrieval.csv` (`t2i_R@1/5/10`, `i2t_R@1/5/10`,
published values, encode time) and `results/clip_zeroshot.csv` (`top1`,
`top5`, `published_top1`, `delta_top1`).

## 5. DINOv3 — instance retrieval (Revisited Oxford/Paris)

The DINOv3 paper reports instance retrieval for the distilled ViT family in
**Table 14, column "Ox.-H"**: Revisited Oxford, Hard protocol, mAP. Protocol
(App. D.8): CLS token (after the last LayerNorm), cosine query↔database; for
Oxford/Paris "resize the larger side to 224 px keeping the aspect ratio, then
take a full center crop → 224×224", i.e. torchvision `CenterCrop(224)` pads the
short side with black (letterbox) — `--preprocess pad224`, the default.

| Model (`--models`) | HF repo | Paper Ox.-H |
|---|---|---|
| `dinov3-vits16` (app model) | facebook/dinov3-vits16-pretrain-lvd1689m | 49.5 |
| `dinov3-vits16plus` | facebook/dinov3-vits16plus-pretrain-lvd1689m | 50.0 |
| `dinov3-vitb16` | facebook/dinov3-vitb16-pretrain-lvd1689m | 58.5 |
| `dinov3-vitl16` (optional) | facebook/dinov3-vitl16-pretrain-lvd1689m | 63.1 |
| `dinov2-small` / `dinov2-base` | facebook/dinov2-small / -base (not gated) | 39.5 / 51.0 |
| `dinov2reg-small` / `dinov2reg-base` | facebook/dinov2-with-registers-small / -base (not gated) | 39.5 / 51.0 |
| `clip-app` | OpenCLIP ViT-B-32 laion2b (semantic search of the app) | – |

Sec. 6.1 names the DINOv2 baseline "DINOv2 with registers"; Table 14 does not
say which variant, so both are run against the same published numbers.

The paper publishes no Paris-H / Oxford-M for distilled models (Tables 9/23
cover only the 7B), so Paris and Easy/Medium are measured without a reference.

**Weights (gated).** Accept the DINOv3 license on *each* repo page above, then:

```fish
uv run hf auth login       # Read token from https://huggingface.co/settings/tokens
uv run python scripts/download_dino_weight.py --repo \
    facebook/dinov3-vits16-pretrain-lvd1689m \
    facebook/dinov3-vits16plus-pretrain-lvd1689m \
    facebook/dinov3-vitb16-pretrain-lvd1689m \
    facebook/dinov2-small facebook/dinov2-base \
    facebook/dinov2-with-registers-small facebook/dinov2-with-registers-base
```

→ `ai-service/models/<repo name>/`. DINOv2 / CLIP download into the HF cache
on first use.

Without HF approval: request the `.pth` files through Meta's form
(https://ai.meta.com/resources/models-and-libraries/dinov3-downloads/), then
`uv run python scripts/convert_dino_pth.py models/dinov3-pth/<file>.pth` writes
the same `models/<repo name>/` folder and checks the CLS output against the
official transformers reference (atol 1e-3). Only ViT-S/16 is mapped so far.

**Dataset** (official sources, same as the `revisitop` toolkit):

```fish
set R $TNG_DATASETS/revisitop
mkdir -p $R/roxford5k/jpg $R/rparis6k/jpg
# Oxford: 1 archive, flat jpgs
curl -L https://www.robots.ox.ac.uk/~vgg/data/oxbuildings/oxbuild_images-v1.tgz | tar -xz -C $R/roxford5k/jpg
curl -L -o $R/roxford5k/gnd_roxford5k.pkl http://cmp.felk.cvut.cz/revisitop/data/datasets/roxford5k/gnd_roxford5k.pkl
# Paris: 2 archives with subfolders (flattened by the check below)
curl -L https://www.robots.ox.ac.uk/~vgg/data/parisbuildings/paris_1-v1.tgz | tar -xz -C $R/rparis6k/jpg
curl -L https://www.robots.ox.ac.uk/~vgg/data/parisbuildings/paris_2-v1.tgz | tar -xz -C $R/rparis6k/jpg
curl -L -o $R/rparis6k/gnd_rparis6k.pkl http://cmp.felk.cvut.cz/revisitop/data/datasets/rparis6k/gnd_rparis6k.pkl
uv run python -m bench.revisitop          # flatten Paris + check 4993 / 6322 images, 70 queries each
```

(The archives hold 5063 / 6412 files; the Revisited imlists keep 4993 / 6322 —
files not listed in `gnd_*.pkl`, incl. Paris' 20 corrupted ones, are ignored.)

**Run:**

```fish
uv run python -m bench.dino_retrieval                     # 8 models × Oxford + Paris, paper protocol (pad224)
uv run python -m bench.dino_retrieval --models dinov3-vits16 --limit-queries 5   # smoke (*_smoke.csv)
# Step 3 — the app's image path (HF processor 224×224, backend WebP ≤512 q85) and query crop
uv run python -m bench.dino_retrieval --models dinov3-vits16 clip-app \
    --preprocess pad224 long224 square224 app --query-crop bbox full
```

| `--preprocess` | Meaning |
|---|---|
| `pad224` | paper (App. D.8): larger side 224, aspect kept, black-padded to 224×224 (bicubic, ImageNet mean/std) |
| `long224` | larger side 224, aspect kept, **no** padding, sides snapped to a patch multiple |
| `square224` | HF image processor (squash to 224×224) — exactly the app provider |
| `app` | backend `toDinoBuffer` (EXIF rotate → ≤512 px → WebP q85) then `square224` |

`--query-crop bbox` (default) crops each query to its annotated box — the
standard revisitop protocol; `full` uses the whole query image. Δ vs paper is
only filled for `pad224` + `bbox` on all 70 queries. Images are batched by
tensor shape (aspect-preserving sizes differ).

Output `results/dino_retrieval.csv`: `mAP_E/M/H`, `mP@1/5/10_*`,
`published_mAP_H`, `delta_mAP_H`, throughput (`img_per_s`, `db_model_s`),
batch-1 latency (`latency_model_ms`, `latency_wall_ms` = load + preprocess +
forward, i.e. per-upload cost), params, weights SHA-256, library versions.

## 6. Classification — 17 gallery tags (Thesis Form §2, §6)

Taxonomy in `cls_taxonomy.py` (edit tags / prompts / rules there): 7 **object**
tags (labels derived from COCO val2017 annotations), 6 **scene** tags (Places365
val categories mapped to tags), 4 **attribute** tags (night, sunset, event,
document — ground truth only from your own reviewed photos).

| Task | Data | Metrics |
|---|---|---|
| T1 scene, single label | `places6` — Places365 val, 60 categories → 6 tags | top-1, top-2, macro-F1, balanced acc, ECE |
| T2 tagging, multi label | `coco` — COCO val2017 → 7 object tags | mAP, macro/micro-F1 (per-tag threshold tuned on val), ECE |
| Full system, 17 tags | `gallery` — your reviewed photos | same as T2 |

Configurations: `zs_clip` (zero-shot, prompt ensembling) · `yolo_rule` (YOLO
detections + the COCO labelling rule — favoured on COCO by construction) ·
`lp_clip` / `lp_dino` / `lp_yolo` / `lp_clip_dino` / `lp_all` (logistic-regression
linear probe on frozen features the app already stores) · `yolo26n_cls_ft`
(full fine-tune of YOLO26n-cls, T1 only). Splits are fixed 60/20/20 by file-name
hash; C (grid 0.001–3, warning if the best C sits on the grid edge) and per-tag
thresholds are picked on val, results reported on test with a **95% bootstrap CI**
(`--bootstrap 1000`, resampling test images). Every row also stores its `val_score`
(T1 macro-F1, T2 mAP); T1 writes a confusion matrix to `results/cls_confusion.csv`.

**Data (Places365 val, ~0.5 GB):** official URLs (same as `torchvision.datasets.Places365`):

```fish
set P $TNG_DATASETS/places365
mkdir -p $P
curl -L -o $P/filelist.tar http://data.csail.mit.edu/places/places365/filelist_places365-standard.tar
curl -L -C - -o $P/val_256.tar http://data.csail.mit.edu/places/places365/val_256.tar
md5 $P/filelist.tar $P/val_256.tar   # 35a0585fee1fa656440f3ab298f8479c · e27b17d8d44f4af9a78502beb927f808
tar -xf $P/filelist.tar -C $P        # → categories_places365.txt, places365_val.txt, …
tar -xf $P/val_256.tar -C $P         # → val_256/
rm $P/filelist.tar $P/val_256.tar
```

COCO val2017 is already in place (section 1). YOLO26n-cls weights for the fine-tune:
`uv run python scripts/download_yolo_weight.py --model yolo26n-cls.pt`.

**Run:**

```fish
uv run python -m bench.cls_eval --limit 300              # smoke (*_smoke.csv), ~1–2 min
uv run python -m bench.cls_eval                          # places6 + coco × 7 configs
uv run python -m bench.cls_yolo_finetune                 # C6: YOLO26n-cls fine-tune (30 epochs)
uv run python -m bench.cls_yolo_finetune --eval-only     # re-evaluate best.pt (adds CI) without retraining
uv run python -m bench.report
```

The first run extracts CLIP / DINOv3 / YOLO features once (cached under
`$TNG_DATASETS/cls_cache/`); later runs only train the probes (seconds). Trained
models go to `bench/runs/cls/<dataset>-<config>.npz` (plain arrays + JSON).

**Ground truth from your own photos (pre-label → review):**

```fish
mkdir -p $TNG_DATASETS/gallery-gt/images      # copy photos here (JPEG/PNG/WebP; convert HEIC first)
uv run python -m bench.cls_prelabel           # → gallery-gt/labels.json (status = auto)
# … review labels in the UI (sets status = reviewed) …
uv run python -m bench.cls_eval --datasets gallery
```

`cls_prelabel` uses the system `best` by default: for each tag group the saved
model with the highest **val** score (object ← COCO, scene ← Places6), attribute ←
zero-shot; `--system lp_all` forces one config. Nothing trained yet → zero-shot. Re-running it never overwrites reviewed entries: it only refreshes
`predicted` / `suggested`; images whose content changed (sha256) go back to `auto`.

## 6b. Search — CLIP vs tag/YOLO vs hybrid (vi / en / ja)

Evaluates the app's Spotlight pipeline (`backend/src/modules/ai/hybrid.search.service.js`
+ `search.query.js`, same lexicon `search.lexicon.json`, same constants) on the
COCO val2017 **test split** (probes never saw it). Only features the app stores at
upload time are used — CLIP vector, 17 tag probabilities (`app/tagging.py`), YOLO26
detections — so a search runs no image model, only the CLIP text encoder.

Queries are generated from COCO annotations with the same templates in every
language (no translation needed): `tag` ("đồ ăn"), `object` ("chó"), `count`
("2 con chó" — exactly n instances), `pair` ("chó và mèo"), and `caption` (English
COCO captions; needs `annotations/captions_val2017.json` from COCO
`annotations_trainval2017.zip`, otherwise skipped). Modes: `clip` (old search),
`struct` (tag + YOLO only), `hybrid` (app default). Metrics: mAP, P@10, R@1/5/10,
`parse_ok` (query understood as generated), scoring latency.

Needs the COCO feature cache + probes from section 6 (`bench.cls_eval --datasets coco`).

```fish
uv run python -m bench.search_eval                               # vi + en + ja, all modes
uv run python -m bench.search_eval --langs vi en --types count pair
```

**Multilingual CLIP** (OpenCLIP `xlm-roberta-base-ViT-B-32` / `laion5b_s13b_b90k`,
512-d, different image tower → own features + probes):

```fish
set -x BENCH_CLIP xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k
uv run python -m bench.cls_eval --datasets coco places6 --configs zs_clip lp_clip   # features + probes → runs/cls/xlm-roberta-base-ViT-B-32/
uv run python -m bench.search_eval
set -e BENCH_CLIP
```

Results → `results/search_eval.csv` (column `clip_model` tells the runs apart).
To use it in the app: set `AI_CLIP_MODEL` / `AI_CLIP_PRETRAINED` in `.env`, restart
ai-service, then re-embed (Settings → AI processing, or `npm run backfill:embed`) —
old vectors count as pending and photos are re-tagged automatically.

## 7. Report

```fish
uv run python -m bench.report                  # → results/REPORT.md
uv run python -m bench.report --format latex   # → results/REPORT.tex (booktabs)
uv run python -m bench.report --lang en        # → results/REPORT.en.md (English, for the thesis)
uv run python -m bench.report --lang en --format latex   # → results/REPORT.en.tex
```

Tables: YOLOv10 reproduction · YOLO26 reproduction · YOLOv10 vs YOLO26 (same
machine) · latency NMS vs NMS-free · export benchmark · CLIP retrieval · CLIP
zero-shot · DINOv3 retrieval · classification T1 / T2. Each key uses its latest run, so re-running a script updates the
report.

## Files

| File | Role |
|---|---|
| `common.py` | paths, environment metadata, SHA-256, CSV append |
| `published.py` | published numbers + sources |
| `download_coco.py` | verify COCO val2017, write `coco-val2017.yaml` |
| `search_eval.py` | search benchmark: CLIP vs tag/YOLO vs hybrid, vi/en/ja (mirrors the backend search) |
| `yolo_coco_val.py` | COCO AP (Ultralytics + pycocotools) |
| `yolo_latency.py` | batch-1 latency, NMS vs NMS-free |
| `yolo_export_benchmark.py` | Ultralytics `benchmark()` per export format |
| `clip_data.py` | CLIP_benchmark webdataset reader |
| `clip_eval.py` | CLIP retrieval + zero-shot + ablations |
| `revisitop.py` | Revisited Oxford/Paris reader, layout check, mAP (E/M/H) |
| `dino_retrieval.py` | DINOv3 / DINOv2 / CLIP instance retrieval + latency |
| `cls_taxonomy.py` | 17 tags: definitions, CLIP prompts, COCO rules, Places365 mapping |
| `cls_data.py` / `cls_features.py` | labelled datasets · cached CLIP / DINOv3 / YOLO features (app providers) |
| `cls_models.py` | zero-shot, linear probe, YOLO rule, thresholds, metrics (mAP, F1, ECE), save/load |
| `cls_eval.py` / `cls_yolo_finetune.py` | classification benchmark · YOLO26n-cls fine-tune |
| `cls_prelabel.py` | draft labels for your photos → `gallery-gt/labels.json` |
| `report.py` | CSV → Markdown / LaTeX tables |
| `results/` | result CSVs (tracked); `*_smoke.csv` ignored |
| `runs/` | raw Ultralytics outputs (ignored) |
