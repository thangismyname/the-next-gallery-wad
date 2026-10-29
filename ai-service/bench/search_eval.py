"""Benchmark search — CLIP thuần vs có cấu trúc (tag + YOLO) vs kết hợp, vi / en / ja.

Đo đúng pipeline Spotlight của app (backend hybrid.search.service.js +
search.query.js) trên COCO val2017, chỉ phần TEST (60/20/20 như cls_eval — probe
gắn tag chưa thấy các ảnh này). Mọi đặc trưng là thứ app đã lưu lúc upload:
vector CLIP, xác suất 17 tag (app/tagging.py), detection YOLO26 → search không
chạy model ảnh nào, chỉ CLIP text encoder.

Chế độ (--modes):
    clip     cosine(text, ảnh), query ≤3 từ bọc "a photo of a {}" — search cũ (mode=clip)
    struct   chỉ tag + vật thể hiểu được từ câu (từ điển), không CLIP
    hybrid   search kết hợp của app (mặc định của Spotlight)

Loại truy vấn (sinh từ annotation COCO, cùng khuôn cho cả 3 ngôn ngữ — không cần dịch):
    tag        "đồ ăn" / "food" / "料理"           đúng = ảnh có tag (luật COCO của taxonomy)
    object     "chó" / "dog" / "犬"                 đúng = ảnh có ≥1 con
    count      "2 con chó" / "two dogs" / "2匹の犬" đúng = ảnh có ĐÚNG n con (đếm là điểm yếu của CLIP)
    pair       "chó và mèo" / "dog and cat"         đúng = ảnh có cả hai
    caption    caption COCO (chỉ en; cần annotations/captions_val2017.json) — R@1/5/10

Metric: mAP + P@10 (tag/object/count/pair), R@1/5/10 (caption), tỉ lệ câu hiểu
đúng cấu trúc (parse), độ trễ chấm điểm / truy vấn. Kết quả → results/search_eval.csv.

CLIP đa ngôn ngữ: BENCH_CLIP=xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k (cần cache
feature + probe của CLIP đó: chạy bench.cls_eval với cùng BENCH_CLIP trước).

Usage (từ ai-service/):
    uv run python -m bench.search_eval                         # vi + en + ja, mọi chế độ
    uv run python -m bench.search_eval --langs vi en --types count pair
    BENCH_CLIP=xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k uv run python -m bench.search_eval
"""
from __future__ import annotations

import argparse
import json
import random
import re
import time
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np

from bench.cls_data import load_coco_tags
from bench.cls_features import CLIP_MODEL, cache_dir, load_features, provider
from bench.cls_taxonomy import OBJECT_TAGS, TAG_IDS
from bench.common import DEFAULT_DATA_ROOT, RESULTS_DIR, SERVICE_ROOT, append_csv, environment_info, utc_now

RESULTS_CSV = RESULTS_DIR / "search_eval.csv"
LEXICON_FILE = SERVICE_ROOT.parent / "backend" / "src" / "modules" / "ai" / "search.lexicon.json"
LEXICON = json.loads(LEXICON_FILE.read_text())
MODES = ("clip", "struct", "hybrid")
TYPES = ("tag", "object", "count", "pair", "caption")
LANGS = ("vi", "en", "ja")

# ── GIỮ KHỚP backend/src/modules/ai/hybrid.search.service.js ─────────────
PARAMS = {
    "clip_range": 0.5, "tag": 0.25, "object": 0.25,
    "z_center": 3.0, "z_slope": 1.5, "floor": 0.02, "tie_break": 0.001,
    "min_rows_for_z": 30,
}
OBJECT_MIN_CONF = 0.4  # = AI_YOLO_MIN_CONF
CLIP_MIN_SIM = 0.22    # = AI_CLIP_MIN_SIM (chỉ ảnh hưởng số kết quả app trả, không ảnh hưởng xếp hạng)

# ── Hiểu truy vấn — GIỮ KHỚP backend/src/modules/ai/search.query.js ──────
CJK = re.compile(r"[぀-ヿ㐀-鿿]")
SPLIT = re.compile(r"[\s,.!?;:()\"'、。，]+")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text).lower()).strip()


def _words(items) -> str:
    return "|".join(re.escape(w) for w in sorted(items, key=len, reverse=True))


def _build_entries() -> list[tuple[str, str, str, bool, re.Pattern]]:
    entries = []
    for kind, table in (("tag", LEXICON["tags"]), ("object", LEXICON["objects"])):
        for ident, names in table.items():
            for lang in LANGS:
                for raw in names.get(lang, []):
                    term = normalize(raw)
                    cjk = bool(CJK.search(term))
                    pattern = re.escape(term) if cjk else rf"(?<!\w){re.escape(term)}(?:s|es)?(?!\w)"
                    entries.append((kind, ident, term, cjk, re.compile(pattern)))
    return sorted(entries, key=lambda e: len(e[2]), reverse=True)


ENTRIES = _build_entries()
NUMBER_WORDS = {**LEXICON["numbers"]["vi"], **LEXICON["numbers"]["en"], **LEXICON["numbers"]["ja"]}
LATIN_NUMBER = r"\d+|" + _words({**LEXICON["numbers"]["vi"], **LEXICON["numbers"]["en"]})
JA_NUMBER = r"\d+|[" + "".join(LEXICON["numbers"]["ja"]) + "]+"
JA_UNITS = _words(LEXICON["units"]["ja"])
COUNT_BEFORE_LATIN = re.compile(rf"(?:^|\W)({LATIN_NUMBER})\s*(?:(?:{_words(LEXICON['units']['vi'])})\s*)?$")
COUNT_BEFORE_JA = re.compile(rf"({JA_NUMBER})(?:{JA_UNITS})?の?\s*$")
COUNT_AFTER_JA = re.compile(rf"^\s*(?:が|は|も)?({JA_NUMBER})(?:{JA_UNITS})")
STOP_LATIN = {
    *LEXICON["stopwords"]["vi"], *LEXICON["stopwords"]["en"], *LEXICON["units"]["vi"],
    *LEXICON["numbers"]["vi"], *LEXICON["numbers"]["en"],
}
STOP_JA = re.compile(_words([*LEXICON["stopwords"]["ja"], *LEXICON["units"]["ja"]])
                     + "|[" + "".join(LEXICON["numbers"]["ja"]) + r"]|\d")


def _to_number(token: str) -> int | None:
    if token.isdigit():
        return int(token)
    return NUMBER_WORDS.get(token, NUMBER_WORDS.get(token[0]))


def _count_for(text: str, start: int, end: int, cjk: bool) -> int | None:
    before = text[:start]
    m = COUNT_BEFORE_LATIN.search(before) or COUNT_BEFORE_JA.search(before)
    if m is None and cjk:
        m = COUNT_AFTER_JA.search(text[end:])
    n = _to_number(m.group(1)) if m else None
    return n if n and 0 < n <= 50 else None


def _content_length(text: str) -> int:
    tokens = [t for t in SPLIT.split(text) if t and t not in STOP_LATIN]
    return len("".join(STOP_JA.sub("", t) for t in tokens))


def parse_query(query: str) -> dict:
    """→ {tags, objects: [{cls, count}], coverage} — như parseQuery của backend."""
    text = normalize(query)
    taken = [False] * len(text)
    tags: list[str] = []
    objects: dict[str, dict] = {}
    for kind, ident, _term, cjk, regex in ENTRIES:
        for match in regex.finditer(text):
            start, end = match.span()
            if any(taken[start:end]):
                continue
            taken[start:end] = [True] * (end - start)
            if kind == "tag":
                if ident not in tags:
                    tags.append(ident)
            else:
                count = _count_for(text, start, end, cjk)
                prev = objects.get(ident)
                objects[ident] = {"cls": ident, "count": prev["count"] if prev and prev["count"] else count}
    coverage = 0.0
    if tags or objects:
        understood = sum(1 for ch, t in zip(text, taken) if t and not ch.isspace())
        rest = _content_length("".join(" " if t else ch for ch, t in zip(text, taken)))
        coverage = understood / (understood + rest) if understood + rest else 0.0
    return {"tags": tags, "objects": list(objects.values()), "coverage": coverage}


def apply_template(query: str) -> str:
    """= embedding.service.js::applyQueryTemplate."""
    trimmed = re.sub(r"[.!?,;:]+$", "", query.strip()).strip()
    words = [w for w in trimmed.split() if w]
    if not words or len(words) > 3:
        return query
    return f"a photo of a {trimmed or query}"


# ── Chấm điểm — GIỮ KHỚP hybrid.search.service.js ────────────────────────
def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))


def clip_probabilities(margin: np.ndarray, logit_scale: float) -> np.ndarray:
    if len(margin) < PARAMS["min_rows_for_z"]:
        return sigmoid(logit_scale * margin)
    sd = margin.std() or 1.0
    return sigmoid(PARAMS["z_slope"] * ((margin - margin.mean()) / sd - PARAMS["z_center"]))


def count_factor(found: np.ndarray, wanted: int | None) -> np.ndarray:
    if wanted is None:
        return (found > 0).astype(float)
    return np.where(found == 0, 0.0, np.where(found == wanted, 1.0,
                    np.where(found > wanted, 0.5, 0.5 * found / wanted)))


class Index:
    """Đặc trưng app đã lưu cho N ảnh: vector CLIP, xác suất tag, detection YOLO."""

    def __init__(self, clip: np.ndarray, tag_probs: np.ndarray, detections: list[list[dict]]) -> None:
        self.clip = clip
        self.tag_probs = tag_probs  # (N, 17) theo TAG_IDS
        self.det_n: dict[str, np.ndarray] = {}
        self.det_conf: dict[str, np.ndarray] = {}
        for i, dets in enumerate(detections):
            for d in dets:
                if d["confidence"] < OBJECT_MIN_CONF:
                    continue
                cls = d["class_name"]
                if cls not in self.det_n:
                    self.det_n[cls] = np.zeros(len(clip))
                    self.det_conf[cls] = np.zeros(len(clip))
                self.det_n[cls][i] += 1
                self.det_conf[cls][i] = max(self.det_conf[cls][i], d["confidence"])

    def object_part(self, objects: list[dict]) -> np.ndarray:
        total = np.zeros(len(self.clip))
        for obj in objects:
            n = self.det_n.get(obj["cls"], np.zeros(len(self.clip)))
            conf = self.det_conf.get(obj["cls"], np.zeros(len(self.clip)))
            total += conf * count_factor(n, obj["count"])
        return total / len(objects)

    def tag_part(self, tags: list[str]) -> np.ndarray:
        return self.tag_probs[:, [TAG_IDS.index(t) for t in tags]].mean(axis=1)


def score(index: Index, mode: str, parsed: dict, q_emb: np.ndarray, negative: np.ndarray,
          logit_scale: float) -> np.ndarray:
    """`q_emb` = vector CLIP của câu đã qua apply_template (backend dùng cho cả 2 chế độ)."""
    if mode == "clip":
        return index.clip @ q_emb
    parts, weights = {}, {}
    if parsed["tags"]:
        parts["tag"], weights["tag"] = index.tag_part(parsed["tags"]), PARAMS["tag"]
    if parsed["objects"]:
        parts["object"], weights["object"] = index.object_part(parsed["objects"]), PARAMS["object"]
    structured = bool(weights)
    if mode == "struct":
        if not structured:
            return np.zeros(len(index.clip))
    else:
        margin = index.clip @ q_emb - index.clip @ negative
        parts["clip"] = clip_probabilities(margin, logit_scale)
        clip_weight = PARAMS["clip_range"] * (1 - parsed["coverage"]) if structured else 1.0
        if clip_weight > 0:
            weights["clip"] = clip_weight
    log_sum = sum(w * np.log(np.maximum(parts[k], PARAMS["floor"])) for k, w in weights.items())
    out = np.exp(log_sum / sum(weights.values()))
    if mode == "hybrid" and structured:
        out = np.minimum(1.0, out + PARAMS["tie_break"] * parts["clip"])
    return out


# ── Truy vấn sinh từ COCO ────────────────────────────────────────────────
COUNT_CLASSES = ["person", "dog", "cat", "car", "bird", "sheep", "cow", "horse", "elephant",
                 "zebra", "giraffe", "bus", "motorcycle", "bicycle", "boat", "airplane", "bottle",
                 "cup", "chair", "umbrella", "pizza", "banana", "donut", "clock"]
JA_UNIT = {"person": "人", "car": "台", "bus": "台", "motorcycle": "台", "bicycle": "台", "boat": "隻",
           "airplane": "機", "bird": "羽", "bottle": "本", "umbrella": "本", "banana": "本",
           "chair": "脚", "pizza": "枚"}
EN_PLURAL = {"person": "people", "bus": "buses", "sheep": "sheep", "knife": "knives"}
EN_NUMBER = {v: k for k, v in LEXICON["numbers"]["en"].items()}
VI_NUMBER = {v: k for k, v in LEXICON["numbers"]["vi"].items() if k != "tư"}
JOIN = {"vi": " và ", "en": " and ", "ja": "と"}


def name(kind: str, ident: str, lang: str) -> str:
    table = LEXICON["tags"] if kind == "tag" else LEXICON["objects"]
    return table[ident][lang][0]


def count_phrase(cls: str, n: int, lang: str) -> str:
    term = name("object", cls, lang)
    if lang == "vi":
        unit = LEXICON["objects"][cls].get("vi_unit", "")
        return " ".join(p for p in (VI_NUMBER[n], unit, term) if p)
    if lang == "en":
        plural = EN_PLURAL.get(cls, term if term.endswith("s") else term + "s")
        return f"{EN_NUMBER[n]} {plural if n > 1 else term}"
    return f"{n}{JA_UNIT.get(cls, '匹' if cls in ('dog', 'cat', 'sheep', 'cow', 'horse', 'elephant', 'zebra', 'giraffe', 'bear') else '個')}の{term}"


def coco_instances(data_root: Path, files: list[str]) -> tuple[list[Counter], dict[int, list[str]]]:
    """Số instance mỗi class / ảnh (bỏ crowd) + caption (nếu có file)."""
    ann_dir = data_root.expanduser().resolve() / "coco" / "annotations"
    data = json.loads((ann_dir / "instances_val2017.json").read_text())
    cat = {c["id"]: c["name"] for c in data["categories"]}
    by_file = {img["file_name"]: img["id"] for img in data["images"]}
    counts: dict[int, Counter] = {}
    for ann in data["annotations"]:
        if not ann.get("iscrowd"):
            counts.setdefault(ann["image_id"], Counter())[cat[ann["category_id"]]] += 1
    ids = [by_file[Path(f).name] for f in files]
    captions: dict[int, list[str]] = {}
    cap_file = ann_dir / "captions_val2017.json"
    if cap_file.exists():
        for ann in json.loads(cap_file.read_text())["annotations"]:
            captions.setdefault(ann["image_id"], []).append(ann["caption"].strip())
    per_image = [counts.get(i, Counter()) for i in ids]
    caption_by_index = {k: captions[i] for k, i in enumerate(ids) if i in captions}
    return per_image, caption_by_index


def build_queries(types, langs, Y_tags: np.ndarray, counts: list[Counter], captions: dict,
                  min_relevant: int, max_captions: int) -> list[dict]:
    """Mỗi truy vấn: {type, lang, text, relevant (N,) bool, expect (cấu trúc đúng)}."""
    N = len(counts)
    has = lambda cls: np.array([c[cls] > 0 for c in counts])  # noqa: E731
    exactly = lambda cls, n: np.array([c[cls] == n for c in counts])  # noqa: E731
    queries = []
    for lang in langs:
        if "tag" in types:
            for j, tag in enumerate(OBJECT_TAGS):
                if Y_tags[:, j].sum() >= min_relevant:
                    queries.append({"type": "tag", "lang": lang, "text": name("tag", tag, lang),
                                    "relevant": Y_tags[:, j], "expect": {"tags": [tag], "objects": []}})
        frequent = [cls for cls in LEXICON["objects"] if has(cls).sum() >= min_relevant]
        if "object" in types:
            for cls in frequent:
                queries.append({"type": "object", "lang": lang, "text": name("object", cls, lang),
                                "relevant": has(cls), "expect": {"tags": [], "objects": [(cls, None)]}})
        if "count" in types:
            for cls in COUNT_CLASSES:
                for n in (1, 2, 3):
                    rel = exactly(cls, n)
                    if rel.sum() >= min_relevant:
                        queries.append({"type": "count", "lang": lang, "text": count_phrase(cls, n, lang),
                                        "relevant": rel, "expect": {"tags": [], "objects": [(cls, n)]}})
        if "pair" in types:
            pair_counts = Counter()
            for c in counts:
                present = sorted(k for k in c if k in frequent and k != "person")
                pair_counts.update((a, b) for i, a in enumerate(present) for b in present[i + 1:])
            for (a, b), k in pair_counts.most_common(15):
                if k >= min_relevant:
                    queries.append({"type": "pair", "lang": lang,
                                    "text": name("object", a, lang) + JOIN[lang] + name("object", b, lang),
                                    "relevant": has(a) & has(b),
                                    "expect": {"tags": [], "objects": [(a, None), (b, None)]}})
    if "caption" in types and "en" in langs and captions:
        rng = random.Random(0)
        for i in rng.sample(sorted(captions), min(max_captions, len(captions))):
            rel = np.zeros(N, dtype=bool)
            rel[i] = True
            queries.append({"type": "caption", "lang": "en", "text": rng.choice(captions[i]),
                            "relevant": rel, "expect": None})
    return queries


def parsed_as_expected(parsed: dict, expect: dict | None) -> bool | None:
    if expect is None:
        return None
    got = {(o["cls"], o["count"]) for o in parsed["objects"]}
    return set(parsed["tags"]) == set(expect["tags"]) and got == set(expect["objects"])


# ── Metric ───────────────────────────────────────────────────────────────
def average_precision(scores: np.ndarray, relevant: np.ndarray) -> float:
    from sklearn.metrics import average_precision_score
    return float(average_precision_score(relevant, scores)) if relevant.any() else float("nan")


def precision_at(scores: np.ndarray, relevant: np.ndarray, k: int) -> float:
    top = np.argsort(-scores, kind="stable")[:k]
    return float(relevant[top].mean())


def recall_at(scores: np.ndarray, relevant: np.ndarray, k: int) -> float:
    top = np.argsort(-scores, kind="stable")[:k]
    return float(relevant[top].any())


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark search: CLIP vs tag/YOLO vs kết hợp.")
    parser.add_argument("--langs", nargs="+", default=list(LANGS), choices=LANGS)
    parser.add_argument("--types", nargs="+", default=list(TYPES), choices=TYPES)
    parser.add_argument("--modes", nargs="+", default=list(MODES), choices=MODES)
    parser.add_argument("--split", default="test", choices=["train", "val", "test", "all"],
                        help="Ảnh dùng làm bộ sưu tập (mặc định test — probe chưa thấy).")
    parser.add_argument("--min-relevant", type=int, default=5)
    parser.add_argument("--max-captions", type=int, default=1000)
    parser.add_argument("--tag-config", default="lp_clip", help="= AI_TAG_CONFIG của ai-service")
    parser.add_argument("--image-preprocess", default="backend", choices=["backend", "raw"])
    parser.add_argument("--device", default="auto")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--csv", type=Path, default=RESULTS_CSV)
    args = parser.parse_args()

    from app.tagging import Tagger

    ds = load_coco_tags(args.data_root)
    idx = np.arange(len(ds.files)) if args.split == "all" else ds.subset(args.split)
    files = [ds.files[i] for i in idx]
    clip_all = load_features(ds, "clip", args.data_root, args.image_preprocess, args.device)
    det_file = cache_dir(args.data_root, ds.name) / f"yolo-{args.image_preprocess}-detections.json"
    if not det_file.exists():
        raise SystemExit(f"Thiếu {det_file} — chạy `uv run python -m bench.cls_eval --datasets coco` trước.")
    detections = json.loads(det_file.read_text())

    clip_provider = provider("clip", args.device)
    tagger = Tagger(clip_provider, "bench/runs/cls", args.tag_config)
    print(f"CLIP {'/'.join(CLIP_MODEL)} · tagger {tagger.model} · {len(files)} ảnh ({args.split})", flush=True)

    clip = clip_all[idx]
    index = Index(clip, tagger.predict(clip), [detections.get(f, []) for f in files])
    counts, captions = coco_instances(args.data_root, files)
    if "caption" in args.types and not captions:
        print("  ! Không có annotations/captions_val2017.json — bỏ loại truy vấn caption "
              "(tải annotations_trainval2017.zip của COCO, chép file đó vào coco/annotations/).")
    queries = build_queries(args.types, args.langs, ds.Y[idx], counts, captions,
                            args.min_relevant, args.max_captions)
    print(f"{len(queries)} truy vấn", flush=True)

    texts = [q["text"] for q in queries]
    t0 = time.perf_counter()
    q_emb = clip_provider.encode_texts([apply_template(t) for t in texts])
    encode_ms = 1000 * (time.perf_counter() - t0) / max(1, len(texts))
    neg = clip_provider.encode_texts(LEXICON["negatives"]).mean(axis=0)
    neg /= np.linalg.norm(neg) or 1.0
    scale = clip_provider.logit_scale

    rows: dict[tuple, list[dict]] = {}
    for qi, q in enumerate(queries):
        parsed = parse_query(q["text"])
        ok = parsed_as_expected(parsed, q["expect"])
        for mode in args.modes:
            t1 = time.perf_counter()
            s = score(index, mode, parsed, q_emb[qi], neg, scale)
            ms = 1000 * (time.perf_counter() - t1)
            rel = q["relevant"]
            m = {"ms": ms, "parsed": ok}
            if q["type"] == "caption":
                m |= {f"R@{k}": recall_at(s, rel, k) for k in (1, 5, 10)}
            else:
                m |= {"AP": average_precision(s, rel), "P@10": precision_at(s, rel, 10)}
            rows.setdefault((q["type"], q["lang"], mode), []).append(m)

    base = {"timestamp": utc_now(), "clip_model": "/".join(CLIP_MODEL), "tagger": tagger.model,
            "split": args.split, "n_images": len(files), "text_encode_ms": round(encode_ms, 2),
            **environment_info()}
    print(f"\n{'type':8s} {'lang':4s} {'mode':7s} {'n':>4s}  metrics")
    for (qtype, lang, mode), ms in sorted(rows.items()):
        metrics = {}
        for key in ("AP", "P@10", "R@1", "R@5", "R@10"):
            values = [r[key] for r in ms if key in r and not np.isnan(r[key])]
            if values:
                metrics["mAP" if key == "AP" else key] = round(100 * float(np.mean(values)), 2)
        parsed = [r["parsed"] for r in ms if r["parsed"] is not None]
        if parsed:
            metrics["parse_ok"] = round(100 * float(np.mean(parsed)), 1)
        metrics["score_ms"] = round(float(np.mean([r["ms"] for r in ms])), 3)
        append_csv(args.csv, {**base, "query_type": qtype, "lang": lang, "mode": mode,
                              "n_queries": len(ms), **metrics})
        shown = " · ".join(f"{k} {v}" for k, v in metrics.items())
        print(f"{qtype:8s} {lang:4s} {mode:7s} {len(ms):4d}  {shown}")
    print(f"\n→ {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
