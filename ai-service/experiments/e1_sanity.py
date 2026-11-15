"""E1 — Sanity check CLIP search (Flickr30k 1k test, COCO 5k test).

Chạy đúng pipeline production: cùng checkpoint CLIP, cùng preprocess, L2-normalize,
xếp hạng theo cosine. Với vector đã chuẩn hoá, `ORDER BY embedding <=> q` của pgvector
(cosine distance = 1 − cos) cho cùng thứ tự với tích vô hướng → dùng numpy.

Mặc định dùng đúng CLIP của paper (ViT-L/14@336px, weights OpenAI) và đối chiếu số
Table 13 (zero-shot, Radford et al. 2021) trong experiments/data/e1_published.json.
Paper thêm tiền tố "a photo of" vào caption → Δ chấm ở cấu hình
preprocess=raw + caption_prefix khớp `caption_prefix` trong JSON; prefix `none` và
preprocess `backend` (pipeline app: WebP ≤512) chỉ báo cáo thêm.
"Xong khi" |Δ R@1| ≤ tolerance cả hai chiều. Model app có thể thêm qua --models
(không có số công bố → không chấm Δ).
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from experiments.core import PACKAGE_DATA, CommonParams, Run, opt
from experiments.features import clip_provider, parse_clip

PUBLISHED_PATH = PACKAGE_DATA / "e1_published.json"
PAPER_CLIP = "ViT-L-14-336:openai"  # "CLIP" trong Table 13 của paper


@dataclass
class E1Params(CommonParams):
    models: list[str] = opt([PAPER_CLIP], "CLIP MODEL:PRETRAINED (mặc định = CLIP của paper; thêm model app nếu muốn).")
    datasets: list[str] = opt(["flickr30k", "mscoco_captions"], "CLIP_benchmark retrieval sets.",
                              choices=["flickr30k", "mscoco_captions"])
    preprocess: list[str] = opt(["raw", "backend"], "raw = như công bố · backend = pipeline app.")
    caption_prefix: list[str] = opt(["a photo of", "none"], 'Tiền tố caption: "a photo of" (paper) | none.')
    tolerance: float = opt(2.0, "Ngưỡng |Δ R@1| (điểm %) để coi là khớp số công bố.")
    batch_size: int = opt(64, "Batch encode ảnh.")


def run(p: E1Params) -> dict:
    from bench.clip_data import load_retrieval
    from bench.clip_eval import encode_images, encode_texts, retrieval_recalls

    published = json.loads(PUBLISHED_PATH.read_text()) if PUBLISHED_PATH.exists() else {}
    rows = []
    with Run("e1", p) as run:
        for spec in p.models:
            parse_clip(spec)
            run.stage(f"load {spec}")
            provider = clip_provider(spec, p.device)
            for dataset in p.datasets:
                run.stage(f"{spec} · {dataset}: đọc dữ liệu")
                data = load_retrieval(p.root, dataset, p.smoke or None)
                if not data.images:
                    raise SystemExit(f"Không có dữ liệu {dataset} trong {p.root / 'clip_benchmark'} "
                                     "— xem bench/README.md mục CLIP.")
                c2i = np.asarray(data.caption_to_image)
                ref = published.get(spec, {}).get(dataset, {})
                for pre in p.preprocess:
                    run.stage(f"{spec} · {dataset} · {pre}: {len(data.images)} ảnh, {len(data.captions)} caption")
                    X, image_s = encode_images(provider, data.images, p.batch_size, pre)
                    for prefix in p.caption_prefix:
                        texts = data.captions if prefix == "none" else [f"{prefix} {c}" for c in data.captions]
                        T, text_s = encode_texts(provider, texts, 256)
                        rec = retrieval_recalls(X, T, c2i)
                        row = {"model": spec, "dataset": dataset, "preprocess": pre, "caption_prefix": prefix,
                               "images": len(data.images), "captions": len(data.captions), **rec,
                               "image_encode_s": round(image_s, 1), "text_encode_s": round(text_s, 1)}
                        for key in ("t2i_R@1", "t2i_R@5", "t2i_R@10", "i2t_R@1", "i2t_R@5", "i2t_R@10"):
                            row[f"pub_{key}"] = ref.get(key, "")
                        comparable = (bool(ref) and pre == "raw" and not p.smoke
                                      and prefix == ref.get("caption_prefix", "none"))
                        if comparable and ref.get("t2i_R@1") is not None:
                            row["delta_t2i_R@1"] = round(rec["t2i_R@1"] - ref["t2i_R@1"], 2)
                            row["delta_i2t_R@1"] = round(rec["i2t_R@1"] - ref["i2t_R@1"], 2)
                            row["pass"] = (abs(row["delta_t2i_R@1"]) <= p.tolerance
                                           and abs(row["delta_i2t_R@1"]) <= p.tolerance)
                        row["published_source"] = ref.get("source", "")
                        rows.append(row)
                        run.log(f"  t2i R@1/5/10 {rec['t2i_R@1']}/{rec['t2i_R@5']}/{rec['t2i_R@10']} · "
                                f"i2t {rec['i2t_R@1']}/{rec['i2t_R@5']}/{rec['i2t_R@10']}"
                                + (f" · Δ {row.get('delta_t2i_R@1')}/{row.get('delta_i2t_R@1')}"
                                   f" → {'OK' if row.get('pass') else 'LỆCH'}" if "pass" in row else ""))
        run.table("retrieval", rows)
        checked = [r for r in rows if "pass" in r]
        run.summary = {
            "rows": rows,
            "checked": len(checked),
            "all_pass": all(r["pass"] for r in checked) if checked else None,
            "note": "Δ chỉ tính cho preprocess=raw, prefix như paper, full test, model có số công bố.",
        }
        if not checked:
            run.log("  ! chưa có số công bố cho model nào đã chạy — điền experiments/data/e1_published.json")
    return run.summary
