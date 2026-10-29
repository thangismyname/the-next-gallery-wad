"""Benchmark classification / gắn tag — so sánh nhiều cấu hình (Thesis Form mục 2 + 6).

Task:
    T1  places6  phân loại cảnh 1 nhãn (6 tag cảnh)        top-1 / top-2 / macro-F1 / ECE
    T2  coco     gắn tag nhiều nhãn (7 tag đối tượng)      mAP / macro-F1 / micro-F1 / ECE
    —   gallery  hệ thống hoàn chỉnh trên ảnh của bạn (17 tag, nhãn đã duyệt)

Cấu hình (--configs):
    zs_clip        CLIP zero-shot, prompt ensembling (không train)
    yolo_rule      luật từ detection YOLO (không train; chỉ coco)
    lp_clip        linear probe trên CLIP           ┐
    lp_dino        linear probe trên DINOv3         │ "fine-tune nhẹ": train
    lp_yolo        linear probe trên feature YOLO   │ logistic regression trên
    lp_clip_dino   ghép CLIP + DINOv3               │ feature đóng băng
    lp_all         ghép CLIP + DINOv3 + YOLO        ┘
YOLO26n-cls fine-tune toàn mạng nằm ở bench/cls_yolo_finetune.py (cùng CSV).

Quy trình mỗi dataset: chia 60/20/20 cố định → C + ngưỡng / tag chọn trên val →
báo cáo trên test. Model lưu ở bench/runs/cls/<dataset>-<config>.npz để
bench/cls_prelabel.py và ai-service (app/tagging.py) dùng lại.

CLIP khác (vd đa ngôn ngữ): BENCH_CLIP=<model>:<pretrained> → cache feature, model
(bench/runs/cls/<model>/) và cột `clip_model` trong CSV tách riêng.

Usage (từ ai-service/, dữ liệu theo bench/README.md mục 7):
    uv run python -m bench.cls_eval                          # places6 + coco, mọi cấu hình
    uv run python -m bench.cls_eval --datasets coco --configs zs_clip lp_all
    uv run python -m bench.cls_eval --datasets gallery       # sau khi đã duyệt nhãn
    uv run python -m bench.cls_eval --limit 300              # smoke (*_smoke.csv)
    BENCH_CLIP=xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k uv run python -m bench.cls_eval \
        --configs zs_clip lp_clip                             # CLIP đa ngôn ngữ
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np

from bench.cls_data import LOADERS, ClsDataset
from bench.cls_features import (
    CLIP_MODEL,
    CLIP_TAG,
    feature_meta,
    load_features,
    provider,
    yolo_class_names,
)
from bench.cls_models import (
    LinearProbe,
    YoloRule,
    ZeroShotClip,
    bootstrap_ci,
    confusion_rows,
    headline_metrics,
    load_model,
    multilabel_metrics,
    save_model,
    single_label_metrics,
    tune_thresholds,
)
from bench.cls_taxonomy import ATTRIBUTE_TAGS, OBJECT_TAGS, SCENE_TAGS, TAG_IDS, TAXONOMY_VERSION
from bench.common import DEFAULT_DATA_ROOT, RESULTS_DIR, RUNS_DIR, append_csv, environment_info, utc_now

RESULTS_CSV = RESULTS_DIR / "cls_eval.csv"
PER_TAG_CSV = RESULTS_DIR / "cls_eval_per_tag.csv"
CONFUSION_CSV = RESULTS_DIR / "cls_confusion.csv"
# CLIP khác mặc định → model riêng ở runs/cls/<clip model>/ (ai-service tìm ở đó trước).
MODELS_OUT = RUNS_DIR / "cls" / CLIP_TAG if CLIP_TAG else RUNS_DIR / "cls"
PROBES = {
    "lp_clip": ("clip",),
    "lp_dino": ("dino",),
    "lp_yolo": ("yolo",),
    "lp_clip_dino": ("clip", "dino"),
    "lp_all": ("clip", "dino", "yolo"),
}
CONFIGS = ["zs_clip", "yolo_rule", *PROBES]
# Hệ thống hoàn chỉnh (gallery / pre-label): "best" = mỗi nhóm tag tự chọn cấu hình có
# điểm VAL cao nhất (T1: macro-F1, T2: mAP) — chọn trên val, không nhìn test.
# Hoặc tên 1 cấu hình (vd "lp_all") để dùng chung cho mọi nhóm.
SYSTEM_CONFIG = "best"


def needed_features(configs: list[str]) -> list[str]:
    kinds = set()
    for c in configs:
        kinds |= set(PROBES.get(c, ("clip",) if c == "zs_clip" else ("yolo",)))
    return [k for k in ("clip", "dino", "yolo") if k in kinds]


def take(feats: dict, idx: np.ndarray) -> dict:
    return {k: v[idx] for k, v in feats.items()}


def limit_dataset(ds: ClsDataset, n: int) -> ClsDataset:
    keep = np.sort(np.random.default_rng(0).permutation(len(ds.files))[:n])
    # Tên riêng → cache riêng, không ghi đè cache của dataset đầy đủ.
    return ClsDataset(f"{ds.name}-limit{n}", ds.root, [ds.files[i] for i in keep], ds.tags, ds.Y[keep],
                      ds.split[keep], ds.single_label, ds.meta)


def feature_ms_per_image(ds: ClsDataset, kinds, data_root, preprocess) -> float:
    total = 0.0
    for k in kinds:
        meta = feature_meta(ds.name, k, data_root, preprocess)
        if meta.get("seconds_model"):
            total += 1000 * meta["seconds_model"] / len(ds.files)
    return round(total, 2)


def run_split_dataset(ds: ClsDataset, configs: list[str], args, base_row: dict) -> None:
    """places6 / coco: train → val (chọn C, ngưỡng) → test."""
    feats = {k: load_features(ds, k, args.data_root, args.image_preprocess, args.device,
                              args.batch_size, args.workers) for k in needed_features(configs)}
    tr, va, te = ds.subset("train"), ds.subset("val"), ds.subset("test")
    task = "T1" if ds.single_label else "T2"
    print(f"  {ds.summary()}", flush=True)
    for config in configs:
        if config == "yolo_rule" and ds.single_label:
            continue  # luật YOLO chỉ có nghĩa với tag đối tượng
        t0 = time.perf_counter()
        if config == "zs_clip":
            model = ZeroShotClip.build(provider("clip", args.device), ds.tags, ds.single_label)
        elif config == "yolo_rule":
            model = YoloRule(ds.tags, yolo_class_names(args.device))
        else:
            model = LinearProbe.fit(ds.tags, PROBES[config], ds.single_label,
                                    take(feats, tr), ds.Y[tr], take(feats, va), ds.Y[va])
        fit_s = time.perf_counter() - t0
        # Ngưỡng / tag trên val. T1 chấm bằng argmax nên không ảnh hưởng metric, nhưng
        # hệ thống 17 tag (gallery / pre-label) dùng ngưỡng này cho tag cảnh.
        P_val = model.predict(take(feats, va))
        model.thresholds = tune_thresholds(P_val, ds.Y[va])
        val = headline_metrics(P_val, ds.Y[va], ds.single_label, model.thresholds)
        model.val_score = val["macro_f1"] if ds.single_label else val["mAP"]
        t1 = time.perf_counter()
        P = model.predict(take(feats, te))
        predict_ms = 1000 * (time.perf_counter() - t1) / max(1, len(te))
        metrics = (single_label_metrics(P, ds.Y[te], ds.tags) if ds.single_label
                   else multilabel_metrics(P, ds.Y[te], model.thresholds, ds.tags))
        per_tag = metrics.pop("per_tag")
        ci = bootstrap_ci(P, ds.Y[te], ds.single_label, model.thresholds, n=args.bootstrap)
        kinds = getattr(model, "features", ())
        row = {
            **base_row, "timestamp": utc_now(), "task": task, "dataset": ds.name, "config": config,
            "features": "+".join(kinds), "n_train": len(tr), "n_val": len(va), "n_test": len(te),
            "C": getattr(model, "C", ""), "val_score": model.val_score, **metrics, **ci,
            "fit_s": round(fit_s, 2), "classifier_ms_per_image": round(predict_ms, 4),
            "feature_ms_per_image": feature_ms_per_image(ds, kinds, args.data_root, args.image_preprocess),
        }
        append_csv(args.csv, row)
        for r in per_tag:
            append_csv(args.per_tag_csv, {"timestamp": row["timestamp"], "dataset": ds.name,
                                          "config": config, **r})
        if ds.single_label:
            for r in confusion_rows(P, ds.Y[te], ds.tags):
                append_csv(args.confusion_csv, {"timestamp": row["timestamp"], "dataset": ds.name,
                                                "config": config, **r})
        key = "top1" if ds.single_label else "mAP"
        span = f" [{ci[key + '_ci_lo']}–{ci[key + '_ci_hi']}]" if ci else ""
        headline = (f"top1 {metrics['top1']}{span} · macro-F1 {metrics['macro_f1']}" if ds.single_label
                    else f"mAP {metrics['mAP']}{span} · macro-F1 {metrics['macro_f1']}")
        print(f"  → {config:13s} {headline} · ECE {metrics['ece']} · val {model.val_score}", flush=True)
        if hasattr(model, "to_arrays") and not args.limit:
            save_model(MODELS_OUT / f"{ds.name}-{config}.npz", model,
                       {"taxonomy_version": TAXONOMY_VERSION, "trained_on": ds.name,
                        "clip_model": CLIP_MODEL[0], "clip_pretrained": CLIP_MODEL[1],
                        "image_preprocess": args.image_preprocess, "created": row["timestamp"]})


# ── Hệ thống hoàn chỉnh (17 tag) ──────────────────────────────────────────
def best_model_path(dataset: str) -> Path | None:
    """Model đã lưu của `dataset` có điểm val cao nhất (None nếu chưa train gì)."""
    best = None
    for path in sorted(MODELS_OUT.glob(f"{dataset}-*.npz")):
        _, meta = load_model(path)
        score = meta.get("val_score")
        if score is not None and (best is None or score > best[0]):
            best = (score, path)
    return best[1] if best else None


class TagSystem:
    """object ← model COCO · scene ← model Places6 · attribute ← CLIP zero-shot.

    `parts`: [(tags, model, source)] — source = tên file model đã dùng (vd "coco-lp_all").
    """

    def __init__(self, config: str = SYSTEM_CONFIG, device: str = "auto") -> None:
        self.config = config
        self.parts = []
        for dataset, tags in (("coco", OBJECT_TAGS), ("places6", SCENE_TAGS)):
            path = best_model_path(dataset) if config == "best" else MODELS_OUT / f"{dataset}-{config}.npz"
            if path is not None and path.exists():
                model, _ = load_model(path)
                source = path.stem
            else:  # chưa train → zero-shot cho nhóm tag này
                print(f"  ! chưa có model {dataset} ({config}) — dùng zero-shot", flush=True)
                model = ZeroShotClip.build(provider("clip", device), tags, False)
                source = f"{dataset}-zero-shot"
            self.parts.append((tags, model, source))
        zs = ZeroShotClip.build(provider("clip", device), ATTRIBUTE_TAGS, False)
        self.parts.append((ATTRIBUTE_TAGS, zs, "attribute-zero-shot"))
        self.features = sorted({k for _, m, _ in self.parts for k in m.features})

    def predict(self, feats: dict) -> tuple[np.ndarray, np.ndarray]:
        """→ (P (N, 17), thresholds (17,)) theo thứ tự TAG_IDS."""
        P = np.zeros((len(next(iter(feats.values()))), len(TAG_IDS)))
        thr = np.full(len(TAG_IDS), 0.5)
        for tags, model, _ in self.parts:
            cols = [TAG_IDS.index(t) for t in tags]
            P[:, cols] = model.predict(feats)
            thr[cols] = model.thresholds
        return P, thr


def run_gallery(ds: ClsDataset, args, base_row: dict) -> None:
    for config in (SYSTEM_CONFIG, "zs_clip"):
        system = TagSystem(config, args.device)
        feats = {k: load_features(ds, k, args.data_root, args.image_preprocess, args.device,
                                  args.batch_size, args.workers) for k in system.features}
        P, thr = system.predict(feats)
        metrics = multilabel_metrics(P, ds.Y, thr, ds.tags)
        per_tag = metrics.pop("per_tag")
        ci = bootstrap_ci(P, ds.Y, False, thr, n=args.bootstrap)
        row = {**base_row, "timestamp": utc_now(), "task": "system", "dataset": ds.name,
               "config": f"system:{config}", "features": "+".join(system.features),
               "parts": " · ".join(src for _, _, src in system.parts),
               "n_train": 0, "n_val": 0, "n_test": len(ds.files), **metrics, **ci}
        append_csv(args.csv, row)
        for r in per_tag:
            append_csv(args.per_tag_csv, {"timestamp": row["timestamp"], "dataset": ds.name,
                                          "config": row["config"], **r})
        print(f"  → system:{config:8s} mAP {metrics['mAP']} · macro-F1 {metrics['macro_f1']} "
              f"· ECE {metrics['ece']}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark classification / gắn tag.")
    parser.add_argument("--datasets", nargs="+", default=["places6", "coco"], choices=list(LOADERS))
    parser.add_argument("--configs", nargs="+", default=CONFIGS, choices=CONFIGS)
    parser.add_argument("--image-preprocess", default="backend", choices=["backend", "raw"])
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None, help="Chỉ N ảnh mỗi dataset (smoke).")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=RESULTS_CSV)
    parser.add_argument("--per-tag-csv", type=Path, default=PER_TAG_CSV)
    parser.add_argument("--confusion-csv", type=Path, default=CONFUSION_CSV)
    parser.add_argument("--bootstrap", type=int, default=1000,
                        help="Số lần lấy mẫu lại cho CI 95%% (0 = tắt).")
    args = parser.parse_args()
    if args.limit:
        args.csv = args.csv.with_name(args.csv.stem + "_smoke.csv")
        args.per_tag_csv = args.per_tag_csv.with_name(args.per_tag_csv.stem + "_smoke.csv")
        args.confusion_csv = args.confusion_csv.with_name(args.confusion_csv.stem + "_smoke.csv")

    # Đọc mọi dataset trước — thiếu file thì dừng ngay, chưa load model nào.
    datasets = [LOADERS[name](args.data_root) for name in args.datasets]
    if args.limit:
        datasets = [limit_dataset(ds, args.limit) if ds.name != "gallery" else ds for ds in datasets]
    base_row = {"taxonomy_version": TAXONOMY_VERSION, "image_preprocess": args.image_preprocess,
                "clip_model": "/".join(CLIP_MODEL), **environment_info()}
    for ds in datasets:
        print(f"\n=== {ds.name} ===", flush=True)
        if ds.name == "gallery":
            run_gallery(ds, args, base_row)
        else:
            run_split_dataset(ds, args.configs, args, base_row)
    print(f"\n→ {args.csv}\n→ {args.per_tag_csv}\n→ {MODELS_OUT}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
