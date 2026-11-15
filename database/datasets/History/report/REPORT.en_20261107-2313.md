# AI experiment report — The Next Gallery (E1–E6)

Generated 2026-11-07 23:13 · data `map=6f06806690 val=3000 tes=5000` (map = class-mapping hash, val/tes = number of images) · each section uses the latest official run.

Data: Open Images V7, 174 classes (128 objects, 46 scenes/concepts); 3,000 val images for selecting prompts/thresholds/rules, 5,000 test images reported once. Human-verified image-level labels; unlabelled (image, class) pairs are masked out. Models: CLIP ViT-B/32 laion2b (the app's), YOLO26n, images passed through the backend pipeline.

Per-run details: `Results/oi/<exp>/<run_id>/` (per-class / per-query CSVs, result.json). Numbers are fractions in 0–1 (E1 in %).

| experiment | run |
|---|---|
| e1 | `20261107-034923` |
| e2 | `20261107-033218` |
| e3 | `20261107-231117` |
| e4 | `20261107-033725` |
| e5 | `20261107-034838` |
| e6 | `20261107-231158` |

## E1 — CLIP sanity check (Flickr30k 1K, COCO 5K)

run `20261107-034923` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

**Verdict:** ❌ deviates from the paper in at least one direction — see table

| model | dataset | preprocess | prefix | t2i R@1 | R@5 | R@10 | i2t R@1 | R@5 | R@10 | paper R@1 (t2i/i2t) | Δ R@1 | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ViT-L-14-336:openai | flickr30k | raw | a photo of | 65.2 | 88.1 | 93.0 | 88.3 | 98.4 | 99.5 | 68.7 / 88 | -3.5 / 0.3 | ❌ |
| ViT-L-14-336:openai | flickr30k | raw | none | 65.7 | 88.2 | 92.8 | 87.9 | 98 | 99.2 | 68.7 / 88 | – / – |  |
| ViT-L-14-336:openai | flickr30k | backend | a photo of | 65.5 | 87.4 | 92.5 | 86.6 | 97.3 | 99 | 68.7 / 88 | – / – |  |
| ViT-L-14-336:openai | flickr30k | backend | none | 65.8 | 87.4 | 92.5 | 86.8 | 97.6 | 98.7 | 68.7 / 88 | – / – |  |
| ViT-L-14-336:openai | mscoco_captions | raw | a photo of | 35.7 | 60.4 | 70.5 | 59.1 | 81.8 | 88.6 | 37.8 / 58.4 | -2.1 / 0.7 | ❌ |
| ViT-L-14-336:openai | mscoco_captions | raw | none | 36.3 | 61.1 | 71.4 | 58.8 | 80.8 | 88.5 | 37.8 / 58.4 | – / – |  |
| ViT-L-14-336:openai | mscoco_captions | backend | a photo of | 36.7 | 61.2 | 71.3 | 57.6 | 79.9 | 87.5 | 37.8 / 58.4 | – / – |  |
| ViT-L-14-336:openai | mscoco_captions | backend | none | 36.7 | 61.2 | 71.3 | 57.2 | 79.4 | 86.5 | 37.8 / 58.4 | – / – |  |

R@K in %. Δ is only scored for the paper's setting (raw images + "a photo of" caption prefix); `backend` = images passed through the app pipeline (WebP ≤512 px).

## E2 — CLIP zero-shot tagging (RQ1)

run `20261107-033218` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

Prompt template selected on val: **`a photo containing a {}.`** · test mAP **0.884** (CI95 0.875–0.889) · macro-F1 **0.826** (CI95 0.812–0.827)

**Template selection (val):**

| template | val mAP | object | scene |
|---|---|---|---|
| `a photo of a {}.` | 0.878 | 0.859 | 0.935 |
| `a photo of the {}.` | 0.875 | 0.857 | 0.929 |
| `a photo containing a {}.` | 0.887 | 0.871 | 0.935 |
| `a close-up photo of a {}.` | 0.848 | 0.821 | 0.927 |
| `a picture of a {}.` | 0.875 | 0.855 | 0.936 |
| `there is a {} in the photo.` | 0.875 | 0.858 | 0.928 |
| `{}` | 0.872 | 0.853 | 0.928 |
| `ensemble` | 0.881 | 0.863 | 0.934 |

**Test by group** (ECE before → after isotonic calibration; `tag:` = the app's 17 legacy tags):

| group | classes | mAP | macro-F1 | micro-F1 | ECE before | ECE after |
|---|---|---|---|---|---|---|
| all | 170 | 0.884 | 0.826 | 0.817 | 0.148 | 0.031 |
| object | 125 | 0.863 | 0.793 | 0.770 | 0.119 | 0.023 |
| scene | 45 | 0.943 | 0.917 | 0.945 | 0.439 | 0.119 |
| tag:animals | 17 | 0.942 | 0.869 | 0.860 | 0.009 | 0.008 |
| tag:architecture | 11 | 0.897 | 0.854 | 0.831 | 0.309 | 0.043 |
| tag:beach | 4 | 0.917 | 0.864 | 0.875 | 0.192 | 0.086 |
| tag:document | 3 | 0.997 | 0.944 | 0.971 | 0.672 | 0.209 |
| tag:event | 6 | 0.909 | 0.828 | 0.829 | 0.034 | 0.030 |
| tag:food | 22 | 0.889 | 0.809 | 0.812 | 0.047 | 0.037 |
| tag:group | 1 | 0.976 | 0.902 | 0.902 | 0.259 | 0.170 |
| tag:indoor | 17 | 0.838 | 0.782 | 0.810 | 0.149 | 0.071 |
| tag:mountain | 3 | 0.900 | 0.922 | 0.943 | 0.302 | 0.075 |
| tag:nature | 10 | 0.885 | 0.849 | 0.713 | 0.297 | 0.065 |
| tag:night | 1 | 0.985 | 0.957 | 0.957 | 0.249 | 0.215 |
| tag:pets | 2 | 0.969 | 0.935 | 0.935 | 0.011 | 0.007 |
| tag:portrait | 4 | 0.892 | 0.878 | 0.772 | 0.428 | 0.042 |
| tag:sports | 11 | 0.925 | 0.867 | 0.867 | 0.057 | 0.040 |
| tag:street | 9 | 0.936 | 0.917 | 0.940 | 0.430 | 0.098 |
| tag:sunset | 2 | 0.989 | 0.973 | 0.972 | 0.157 | 0.182 |
| tag:vehicles | 11 | 0.868 | 0.803 | 0.796 | 0.037 | 0.019 |

**10 worst / best classes** (full table: `20261107-033218/per_class.csv`):

| class | group | AP test | F1 test | test positives |
|---|---|---|---|---|
| Umbrella | object | 0.368 | 0.369 | 38 |
| Footwear | object | 0.386 | 0.500 | 293 |
| House | object | 0.548 | 0.600 | 204 |
| Sunglasses | object | 0.553 | 0.562 | 51 |
| Flower | object | 0.568 | 0.539 | 140 |
| Orange (fruit) | object | 0.585 | 0.526 | 50 |
| Chair | object | 0.592 | 0.714 | 148 |
| Houseplant | object | 0.598 | 0.596 | 58 |
| Dress | object | 0.611 | 0.598 | 126 |
| Handbag | object | 0.621 | 0.587 | 42 |

| class | group | AP test | F1 test | test positives |
|---|---|---|---|---|
| Sushi | object | 1 | 0.986 | 36 |
| Skateboard | object | 1 | 0.946 | 39 |
| Fire hydrant | object | 1 | 0.987 | 37 |
| Sunrise | scene | 1.000 | 0.980 | 50 |
| Bedroom | scene | 0.999 | 0.973 | 37 |
| Monkey | object | 0.998 | 0.958 | 36 |
| Kitchen | scene | 0.998 | 0.875 | 54 |
| Book | object | 0.998 | 0.940 | 53 |
| Text | scene | 0.998 | 0.994 | 176 |
| Sky | scene | 0.997 | 0.998 | 923 |

## E3 — CLIP zero-shot retrieval (RQ1)

run `20261107-231117` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

**(a) Class-name queries** — `a photo of a {class}`, 5,000 test images:

| protocol | group | query | mAP | P@1 | P@5 | P@10 | P@20 | nDCG@10 |
|---|---|---|---|---|---|---|---|---|
| strict (unlabelled = irrelevant) | all | 174 | 0.650 | 0.960 | 0.923 | 0.885 | 0.817 | 0.910 |
| strict (unlabelled = irrelevant) | object | 128 | 0.662 | 0.977 | 0.931 | 0.891 | 0.823 | 0.919 |
| strict (unlabelled = irrelevant) | scene | 46 | 0.617 | 0.913 | 0.900 | 0.867 | 0.799 | 0.883 |
| verified-only | all | 174 | 0.878 | 0.994 | 0.960 | 0.949 | 0.919 | 0.963 |
| verified-only | object | 128 | 0.854 | 0.992 | 0.953 | 0.939 | 0.907 | 0.957 |
| verified-only | scene | 46 | 0.943 | 1 | 0.978 | 0.976 | 0.954 | 0.979 |

The strict ↔ verified-only gap reflects missing Open Images labels (see `a_fp_review.csv`).

**(b) Localized Narratives captions** (one correct image per caption, 5,000-image collection):

| caption | query | R@1 | R@5 | R@10 | MRR | median rank |
|---|---|---|---|---|---|---|
| full | 5000 | 0.247 | 0.486 | 0.593 | 0.361 | 6 |
| first_sentence | 5000 | 0.176 | 0.365 | 0.470 | 0.272 | 13 |

**(c) Compositional queries** (manual relevance judgments, pool `Classes/open-images/judgments.csv`):

| config | P@10 | P@20 | nDCG@10 | judged |
|---|---|---|---|---|
| en@app | 0.530 | 0.436 | 0.657 | 100% |
| vi@app | 0.060 | 0.056 | 0.069 | 100% |
| vi@multilingual | 0.522 | 0.435 | 0.618 | 100% |

**(d) Vietnamese queries:** postponed (UIT-OpenViIC not available yet).

## E4 — YOLO26 baseline

run `20261107-033725` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

Classes covered by YOLO (COCO): **81** · gap (CLIP only): **93** · test detection mAP@0.5 (Open Images protocol): **0.638**

**Image-level tags from detections** (YOLO-covered classes; `tuned_on_val` = per-class threshold selected on val, `app_*` = the app's default thresholds):

| threshold | group | classes | mAP | macro-F1 | micro-F1 | micro-precision |
|---|---|---|---|---|---|---|
| tuned_on_val | all | 78 | 0.897 | 0.829 | 0.882 | 0.898 |
| tuned_on_val | object | 78 | 0.897 | 0.829 | 0.882 | 0.898 |
| app_conf_0.25 | all | 78 | 0.897 | 0.799 | 0.859 | 0.922 |
| app_conf_0.25 | object | 78 | 0.897 | 0.799 | 0.859 | 0.922 |
| app_min_conf_0.4 | all | 78 | 0.897 | 0.753 | 0.830 | 0.941 |
| app_min_conf_0.4 | object | 78 | 0.897 | 0.753 | 0.830 | 0.941 |

**Detection AP@0.5 — 10 worst / best classes:**

| class | AP | GT | group-of boxes |
|---|---|---|---|
| Hair dryer | 0 | 3 | 0 |
| Bench | 0.019 | 3 | 0 |
| Bowl | 0.104 | 11 | 0 |
| Knife | 0.190 | 37 | 0 |
| Book | 0.193 | 218 | 87 |
| Bear | 0.234 | 81 | 4 |
| Fork | 0.270 | 12 | 0 |
| Kitchen & dining room table | 0.294 | 121 | 3 |
| Umbrella | 0.300 | 57 | 2 |
| Handbag | 0.315 | 39 | 0 |

| class | AP | GT | group-of boxes |
|---|---|---|---|
| Fire hydrant | 0.995 | 35 | 0 |
| Pizza | 0.973 | 45 | 1 |
| Stop sign | 0.971 | 33 | 1 |
| Cat | 0.950 | 49 | 0 |
| Flying disc | 0.917 | 3 | 0 |
| Giraffe | 0.889 | 58 | 0 |
| Mobile phone | 0.888 | 49 | 0 |
| Tennis racket | 0.875 | 43 | 0 |
| Train | 0.857 | 38 | 0 |
| Scissors | 0.852 | 6 | 1 |

Classes YOLO cannot detect (examples): Human face, Tree, Flower, Building, House, Skyscraper, Tower, Castle, Lighthouse, Fountain, Sunglasses, Hat, Footwear, Dress, Guitar, Camera, Balloon, Christmas tree, Swimming pool, Tent…

## E5 — Per-tag YOLO + CLIP fusion (RQ2, C1)

run `20261107-034838` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

Precision target when selecting thresholds/rules on val: **0.9**

**Test — macro-F1 / mAP per class set:**

| strategy | all | YOLO-covered | object | scene | micro-precision |
|---|---|---|---|---|---|
| CLIP only | 0.691 / 0.863 | 0.640 / 0.836 | 0.651 / 0.835 | 0.801 / 0.941 | 0.925 |
| YOLO only | 0.346 / 0.733 | 0.754 / 0.876 | 0.471 / 0.678 | 0 / 0.888 | 0.935 |
| OR (max) | 0.765 / 0.889 | 0.801 / 0.893 | 0.751 / 0.871 | 0.801 / 0.941 | 0.933 |
| AND (min) | 0.739 / 0.884 | 0.746 / 0.881 | 0.717 / 0.863 | 0.801 / 0.941 | 0.931 |
| objects→YOLO, scenes→CLIP | 0.743 / 0.881 | 0.754 / 0.876 | 0.722 / 0.860 | 0.801 / 0.941 | 0.938 |
| **per-tag rule** | 0.764 / 0.888 | 0.799 / 0.890 | 0.750 / 0.869 | 0.801 / 0.941 | 0.930 |

**Is the gain significant? (paired bootstrap 95% CI; excludes 0 = significant)**

| comparison | CI95 macro-F1 | CI95 mAP |
|---|---|---|
| per_tag − CLIP only (all classes) | 0.069 … 0.082 | 0.020 … 0.030 |
| per_tag − YOLO only (YOLO-covered) | 0.037 … 0.058 | 0.007 … 0.023 |

**Which source wins for which tag group** (number of classes choosing each rule on val):

| group | YOLO-covered | classes | clip | yolo | or | and | precision target met |
|---|---|---|---|---|---|---|---|
| object | True | 81 | 19 | 16 | 34 | 12 | 80 |
| object | False | 47 | 47 | 0 | 0 | 0 | 47 |
| scene | False | 46 | 46 | 0 | 0 | 0 | 46 |

## E6 — Hybrid retrieval: tags + CLIP (RQ2)

run `20261107-231158` · Apple M1 Pro · torch 2.14.1 · commit `ab0cfc4`

Boost weight λ selected on val captions: {'yolo': 0.05, 'clip': 0.02, 'fused': 0.02}

**Localized Narratives captions (test)** — Δ MRR vs. plain CLIP, paired bootstrap 95% CI:

| config | tag source | R@1 | R@5 | R@10 | MRR | MRR (queries naming a class) | Δ MRR CI95 |
|---|---|---|---|---|---|---|---|
| clip | - | 0.247 | 0.486 | 0.593 | 0.361 | 0.370 | – |
| filter | yolo | 0.234 | 0.468 | 0.576 | 0.346 | 0.353 | -0.019 … -0.011 |
| boost | yolo | 0.254 | 0.497 | 0.613 | 0.370 | 0.380 | 0.006 … 0.012 |
| filter | clip | 0.173 | 0.375 | 0.488 | 0.275 | 0.273 | -0.092 … -0.079 |
| boost | clip | 0.243 | 0.479 | 0.590 | 0.356 | 0.365 | -0.007 … -0.002 |
| filter | fused | 0.184 | 0.395 | 0.510 | 0.291 | 0.291 | -0.076 … -0.063 |
| boost | fused | 0.249 | 0.488 | 0.600 | 0.364 | 0.373 | 0.001 … 0.006 |

**Compositional queries (manual judgments):**

| config | source | P@10 | P@20 | nDCG@10 | judged |
|---|---|---|---|---|---|
| clip | - | 0.530 | 0.436 | 0.657 | 100% |
| filter | yolo | 0.542 | 0.453 | 0.679 | 100% |
| boost | yolo | 0.545 | 0.455 | 0.675 | 100% |
| filter | clip | 0.465 | 0.405 | 0.574 | 100% |
| boost | clip | 0.525 | 0.430 | 0.649 | 100% |
| filter | fused | 0.512 | 0.425 | 0.631 | 100% |
| boost | fused | 0.543 | 0.438 | 0.671 | 100% |

## Measurement history

Each row is one version in `History/<exp>/`. A different `data_fingerprint` means different data — compare with care.

**e1**

| version | date | machine | commit | data | all_pass |
|---|---|---|---|---|---|
| v001 | 2026-11-06 21:24 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | False |

**e2**

| version | date | machine | commit | data | test.mAP | test.macro_f1 | test.ece_calibrated |
|---|---|---|---|---|---|---|---|
| v001 | 2026-11-06 20:33 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 0.884 | 0.826 | 0.031 |

**e3**

| version | date | machine | commit | data | a_class_queries.known_all.AP | a_class_queries.strict_all.AP | b_captions.full.MRR |
|---|---|---|---|---|---|---|---|
| v001 | 2026-11-06 20:37 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 0.877 | 0.650 | 0.361 |
| v002 | 2026-11-07 16:11 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 0.877 | 0.650 | 0.361 |

**e4**

| version | date | machine | commit | data | test_detection_mAP50 |
|---|---|---|---|---|---|
| v001 | 2026-11-06 20:48 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 0.638 |

**e5**

| version | date | machine | commit | data | test_all_classes.per_tag.macro_f1 | test_all_classes.clip_only.macro_f1 |
|---|---|---|---|---|---|---|
| v001 | 2026-11-06 20:48 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 0.764 | 0.691 |

**e6**

| version | date | machine | commit | data | captions.queries |
|---|---|---|---|---|---|
| v001 | 2026-11-06 20:50 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 5000 |
| v002 | 2026-11-07 16:12 | Apple M1 Pro | ab0cfc4 | map=6f06806690 val=3000 tes=5000 | 5000 |
