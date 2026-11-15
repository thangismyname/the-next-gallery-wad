"""E3 — CLIP zero-shot search (collection = ảnh test của subset Open Images).

(a) Query theo lớp: "a photo of a {lớp}" (đúng applyQueryTemplate của backend).
    Relevant = positive đã xác minh. Hai cách tính:
      strict     — ảnh chưa gán nhãn coi là không liên quan (cận dưới)
      known_only — bỏ ảnh chưa gán nhãn khỏi danh sách xếp hạng
    P@1/5/10/20, AP, nDCG@10. fp_review.csv = false positive điểm cao để xem tay.
(b) Caption Localized Narratives (1 caption / ảnh, cắt 77 token): R@1/5/10, MRR, median rank.
    Biến thể full (tokenizer tự cắt) và first_sentence.
(c) Query ghép tự viết (experiments/data/queries.csv) — top-20 chấm tay qua pool judgments.csv.
(d) Query tiếng Việt (UIT-OpenViIC): vi_direct (CLIP app) · vi_translated (dịch → CLIP app)
    · vi_multilingual (CLIP đa ngôn ngữ). R@1/5/10, MRR.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from bench.common import classes_dir, data_dir
from experiments import judging
from experiments import metrics as M
from experiments.core import CommonParams, Run, opt, write_csv
from experiments.e2_clip_tag import class_words
from experiments.features import APP_CLIP, MULTILINGUAL_CLIP, clip_image_features, encode_texts
from experiments.oi_data import images_dir, load_subset
from pipeline.folder import apply_query_template

QUERIES_PATH = judging.QUERIES_PATH
KS = (1, 5, 10, 20)


def openviic_root(data_root: Path) -> Path:
    """Ảnh: Data/uit-openviic/ · annotation + bản dịch: Classes/uit-openviic/"""
    return data_dir(data_root, "uit-openviic")


def openviic_classes(data_root: Path) -> Path:
    return classes_dir(data_root, "uit-openviic")


@dataclass
class E3Params(CommonParams):
    parts: list[str] = opt(["a", "b", "c"], "Phần chạy: a lớp · b caption · c query ghép · d tiếng Việt (UIT-OpenViIC, tạm hoãn).")
    clip: str = opt(APP_CLIP, "CLIP của app.")
    multilingual_clip: str = opt(MULTILINGUAL_CLIP, "CLIP đa ngôn ngữ (c, d).")
    preprocess: str = opt("backend", "Tiền xử lý ảnh.", choices=["backend", "raw"])
    fp_per_class: int = opt(5, "(a) số false positive đầu bảng / lớp đưa vào fp_review.csv.")
    caption_variants: list[str] = opt(["full", "first_sentence"], "(b) biến thể caption.")
    c_configs: list[str] = opt(["en@app", "vi@app", "vi@multilingual"], "(c) <ngôn ngữ>@<app|multilingual>.")
    top_k: int = opt(20, "(c) số ảnh đầu chấm tay / query.")
    openviic_split: str = opt("test", "(d) split UIT-OpenViIC.")
    translations: str = opt("", "(d) JSON {caption_vi: caption_en}; trống = Classes/uit-openviic/translations_<split>.json.")
    translate_model: str = opt("", "(d) model HF dịch vi→en nếu chưa có file dịch (vd Helsinki-NLP/opus-mt-vi-en).")
    batch_size: int = opt(64, "Batch encode ảnh.")


# ── (a) ───────────────────────────────────────────────────────────────────
def part_a(run: Run, p: E3Params, test, X) -> dict:
    run.stage("(a) query theo lớp")
    words = class_words(test.classes)
    Q = encode_texts(p.clip, [apply_query_template(w) for w in words], p.device)
    S = X @ Q.T
    paths = test.paths()
    rows, fps = [], []
    for c, cls in enumerate(test.classes):
        y = test.Y[:, c]
        if not (y == 1).any():
            continue
        strict = M.ranking_metrics(S[:, c], y == 1, KS)
        m = y != -1
        known_only = M.ranking_metrics(S[m, c], y[m] == 1, KS)
        rows.append({"class": cls["oi_name"], "group": cls["group"], "relevant": int((y == 1).sum()),
                     "unknown": int((y == -1).sum()),
                     **{f"strict_{k}": v for k, v in strict.items()},
                     **{f"known_{k}": v for k, v in known_only.items()}})
        taken = 0
        for rank, i in enumerate(np.argsort(-S[:, c])[:50]):
            if taken >= p.fp_per_class:
                break
            if y[i] != 1:
                taken += 1
                fps.append({"class": cls["oi_name"], "rank": rank + 1, "image_id": test.image_ids[i],
                            "score": float(S[i, c]), "label": "negative" if y[i] == 0 else "unknown",
                            "path": str(paths[i]), "actually_relevant": ""})
    run.table("a_per_class", rows)
    run.table("a_fp_review", sorted(fps, key=lambda r: -r["score"]))
    out = {}
    for mode in ("strict", "known"):
        for g in ("all", "object", "scene"):
            sel = [r for r in rows if g == "all" or r["group"] == g]
            out[f"{mode}_{g}"] = {k: M.nanmean([r[f"{mode}_{k}"] for r in sel])
                                  for k in ("AP", "P@1", "P@5", "P@10", "P@20", "nDCG@10")} | {"queries": len(sel)}
    run.log(f"  mAP strict {out['strict_all']['AP']:.4f} · known-only {out['known_all']['AP']:.4f}")
    return out


# ── (b) ───────────────────────────────────────────────────────────────────
def first_sentence(text: str) -> str:
    return re.split(r"(?<=[.!?])\s+", text.strip(), maxsplit=1)[0]


def part_b(run: Run, p: E3Params, test, X) -> dict:
    run.stage("(b) caption Localized Narratives")
    idx = [i for i, img in enumerate(test.image_ids) if test.captions.get(img)]
    if not idx:
        run.log("  ! subset test chưa có caption (thiếu file narratives khi build) — bỏ qua (b)")
        return {}
    out, rows = {}, []
    for variant in p.caption_variants:
        caps = [test.captions[test.image_ids[i]][0] for i in idx]
        if variant == "first_sentence":
            caps = [first_sentence(c) for c in caps]
        Q = encode_texts(p.clip, caps, p.device)
        ranks = M.target_ranks(Q, X, np.asarray(idx))
        res = M.recall_from_ranks(ranks)
        ci = M.bootstrap_ci(lambda s: {"R@1": float((ranks[s] <= 1).mean()), "MRR": float((1 / ranks[s]).mean())},
                            len(ranks), 200)
        out[variant] = {**res, "queries": len(idx), "collection": len(test.image_ids), "ci95": ci}
        rows.append({"variant": variant, **res, "queries": len(idx)})
        run.log(f"  {variant}: R@1/5/10 {res['R@1']:.3f}/{res['R@5']:.3f}/{res['R@10']:.3f} · MRR {res['MRR']:.3f}")
    run.table("b_captions", rows)
    return out


# ── (c) ───────────────────────────────────────────────────────────────────
def query_text(q: dict, lang: str) -> str:
    return q.get(f"query_{lang}") or ""


def part_c(run: Run, p: E3Params, test, X_by_clip: dict) -> dict:
    run.stage("(c) query ghép, chấm tay")
    if not QUERIES_PATH.exists():
        run.log(f"  ! thiếu {QUERIES_PATH} — bỏ qua (c)")
        return {}
    queries = judging.read_queries()
    pool = judging.read_pool(p.root)
    out, all_pairs, rankings = {}, [], {}
    for config in p.c_configs:
        lang, _, which = config.partition("@")
        spec = p.multilingual_clip if which == "multilingual" else p.clip
        qs = [q for q in queries if query_text(q, lang)]
        texts = [apply_query_template(query_text(q, lang)) for q in qs]
        Q = encode_texts(spec, texts, p.device)
        S = X_by_clip[spec] @ Q.T
        ranked = {q["id"]: [test.image_ids[i] for i in np.argsort(-S[:, j])[:p.top_k]] for j, q in enumerate(qs)}
        rankings[config] = ranked
        all_pairs += [(q, i) for q, ids in ranked.items() for i in ids]
        res = judging.judged_metrics(ranked, pool)
        out[config] = res["summary"]
        write_csv(run.dir / f"c_{config.replace('@', '_')}_per_query.csv", res["per_query"])
        run.log(f"  {config}: P@10 {res['summary'].get('P@10', float('nan')):.3f} · "
                f"judged {res['summary']['judged_fraction']:.0%}")
    added = judging.add_to_pool(p.root, all_pairs)
    pool = judging.read_pool(p.root)
    merged = {}
    for ranked in rankings.values():
        for q, ids in ranked.items():
            merged.setdefault(q, []).extend(i for i in ids if i not in merged.get(q, []))
    n = judging.write_judge_html(run.dir / "judge.html", "E3c — cặp chưa chấm",
                                 {q["id"]: f"{q['query_en']} / {q['query_vi']}" for q in queries}, merged, pool,
                                 lambda i: images_dir(p.root, "test") / f"{i}.jpg")
    if n:
        run.log(f"  → {n} cặp chưa chấm ({added} mới) — mở {run.dir / 'judge.html'}, điền "
                f"{judging.pool_path(p.root)} rồi chạy lại `e3 --parts c`")
    out["unjudged_pairs"] = n
    return out


# ── (d) ───────────────────────────────────────────────────────────────────
def load_openviic(root: Path, ann_root: Path, split: str) -> tuple[list[Path], list[str], np.ndarray]:
    """COCO-format JSON: Classes/uit-openviic/<split>.json (hoặc *<split>*.json),
    ảnh ở Data/uit-openviic/images/<file_name> (hoặc <split>/<file_name>)."""
    candidates = [ann_root / f"{split}.json", *sorted(ann_root.glob(f"*{split}*.json"))]
    path = next((c for c in candidates if c.exists() and "translation" not in c.name), None)
    if path is None:
        raise SystemExit(f"Không thấy annotation UIT-OpenViIC split {split} trong {ann_root} (README Part 0 · E3d).")
    data = json.loads(path.read_text(encoding="utf-8"))
    images = {im["id"]: im["file_name"] for im in data["images"]}
    order = sorted(images)
    index = {img_id: k for k, img_id in enumerate(order)}
    paths = []
    for img_id in order:
        name = images[img_id]
        for base in (root / "images", root / split, root):
            if (base / name).exists():
                paths.append(base / name)
                break
        else:
            raise SystemExit(f"Thiếu ảnh {name} (tìm trong images/, {split}/).")
    caps = [(a["caption"].strip(), index[a["image_id"]]) for a in data["annotations"] if a["image_id"] in index]
    return paths, [c for c, _ in caps], np.asarray([t for _, t in caps])


def translate(captions: list[str], model: str, run: Run) -> dict[str, str]:
    try:
        from transformers import pipeline
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Cần transformers để dịch.") from exc
    try:
        translator = pipeline("translation", model=model)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Không tải được {model} ({exc}). Model Marian cần sentencepiece: "
                         "`uv add --group bench sentencepiece sacremoses`.") from exc
    out, uniq = {}, list(dict.fromkeys(captions))
    for k in range(0, len(uniq), 32):
        batch = uniq[k:k + 32]
        for src, res in zip(batch, translator(batch, max_length=128)):
            out[src] = res["translation_text"]
        run.progress(min(k + 32, len(uniq)), len(uniq), "dịch vi→en")
    return out


def part_d(run: Run, p: E3Params) -> dict:
    run.stage("(d) tiếng Việt — UIT-OpenViIC")
    root = openviic_root(p.root)
    if not root.exists():
        run.log(f"  ! chưa có {root} — bỏ qua (d)")
        return {}
    paths, caps, target = load_openviic(root, openviic_classes(p.root), p.openviic_split)
    if p.smoke:
        keep = target < p.smoke
        paths, caps, target = paths[:p.smoke], [c for c, k in zip(caps, keep) if k], target[keep]
    ids = [str(x) for x in range(len(paths))]
    name = f"openviic-{p.openviic_split}"
    tr_path = Path(p.translations) if p.translations else \
        openviic_classes(p.root) / f"translations_{p.openviic_split}.json"
    trans = json.loads(tr_path.read_text(encoding="utf-8")) if tr_path.exists() else {}
    missing = [c for c in caps if c not in trans]
    if missing and p.translate_model:
        trans.update(translate(missing, p.translate_model, run))
        tr_path.write_text(json.dumps(trans, ensure_ascii=False, indent=0), encoding="utf-8")
        missing = []
    configs = {"vi_direct": (p.clip, caps), "vi_multilingual": (p.multilingual_clip, caps)}
    if not missing:
        configs["vi_translated"] = (p.clip, [trans[c] for c in caps])
        configs["en_translated_multilingual"] = (p.multilingual_clip, [trans[c] for c in caps])
    else:
        run.log(f"  ! thiếu bản dịch cho {len(missing)} caption — bỏ vi_translated (dùng --translate-model "
                f"hoặc tạo {tr_path})")
    out, rows = {}, []
    for config, (spec, texts) in configs.items():
        X = clip_image_features(name, ids, paths, p.root, spec, p.preprocess, p.device, p.batch_size, run=run)
        Q = encode_texts(spec, texts, p.device)
        ranks = M.target_ranks(Q, X, target)
        res = M.recall_from_ranks(ranks)
        out[config] = {**res, "queries": len(texts), "images": len(paths), "clip": spec}
        rows.append({"config": config, "clip": spec, **res})
        run.log(f"  {config}: R@1/5/10 {res['R@1']:.3f}/{res['R@5']:.3f}/{res['R@10']:.3f} · MRR {res['MRR']:.3f}")
    run.table("d_vietnamese", rows)
    return out


def run(p: E3Params) -> dict:
    with Run("e3", p) as run:
        test = load_subset(p.root, "test", p.smoke) if set(p.parts) & {"a", "b", "c"} else None
        X_by_clip = {}
        if test is not None:
            run.stage("CLIP image features (test)")
            X_by_clip[p.clip] = clip_image_features(test.name, test.image_ids, test.paths(), p.root, p.clip,
                                                    p.preprocess, p.device, p.batch_size, run=run)
            if "c" in p.parts and any(c.endswith("@multilingual") for c in p.c_configs):
                X_by_clip[p.multilingual_clip] = clip_image_features(
                    test.name, test.image_ids, test.paths(), p.root, p.multilingual_clip, p.preprocess,
                    p.device, p.batch_size, run=run)
        X = X_by_clip.get(p.clip)
        summary = {}
        if "a" in p.parts:
            summary["a_class_queries"] = part_a(run, p, test, X)
        if "b" in p.parts:
            summary["b_captions"] = part_b(run, p, test, X)
        if "c" in p.parts:
            summary["c_compositional"] = part_c(run, p, test, X_by_clip)
        if "d" in p.parts:
            summary["d_vietnamese"] = part_d(run, p)
        run.summary = summary
    return run.summary
