"""Pool chấm tay cho query ghép (E3c, E6).

File pool: $TNG_DATASETS/Classes/open-images/judgments.csv — cột query_id, image_id, relevant
(1 = đúng, 0 = sai, trống = chưa chấm), note. Mỗi cặp (query, ảnh) chấm 1 lần, dùng chung
cho mọi cấu hình (E3 CLIP, E6 lọc/boost) → cấu hình mới chỉ thêm cặp chưa chấm.

Mỗi run ghi cặp còn thiếu vào pool (relevant trống) + trang judge.html để xem ảnh.
Điền cột relevant trong pool rồi chạy lại thí nghiệm để có metric. Metric với cặp
chưa chấm coi như không liên quan (cận dưới) và kèm judged_fraction.
"""
from __future__ import annotations

import csv
import html
from pathlib import Path

import numpy as np

from experiments import metrics as M
from experiments.core import PACKAGE_DATA, oi_classes_root

QUERIES_PATH = PACKAGE_DATA / "queries.csv"
FIELDS = ["query_id", "image_id", "relevant", "note"]


def read_queries(path: Path = QUERIES_PATH) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        rows = [{k: (v or "").strip() for k, v in r.items()}
                for r in csv.DictReader(line for line in fh if not line.lstrip().startswith("#"))]
    return [r for r in rows if r.get("id")]


def pool_path(data_root: Path) -> Path:
    return oi_classes_root(data_root) / "judgments.csv"


def read_pool(data_root: Path) -> dict[tuple[str, str], str]:
    path = pool_path(data_root)
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as fh:
        return {(r["query_id"], r["image_id"]): (r.get("relevant") or "").strip() for r in csv.DictReader(fh)}


def add_to_pool(data_root: Path, pairs: list[tuple[str, str]]) -> int:
    """Thêm cặp chưa có vào pool (relevant trống). Trả số cặp mới."""
    path = pool_path(data_root)
    existing = read_pool(data_root)
    new = [p for p in dict.fromkeys(pairs) if p not in existing]
    if not new:
        return 0
    write_header = not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        if write_header:
            writer.writeheader()
        for q, i in new:
            writer.writerow({"query_id": q, "image_id": i, "relevant": "", "note": ""})
    return len(new)


def judged_metrics(ranked: dict[str, list[str]], pool: dict, k_list=(10, 20)) -> dict:
    """ranked[query_id] = top-K image id. P@K, nDCG@K (nhị phân, ideal = số ảnh đúng đã
    biết của query trong pool), judged_fraction."""
    rows, judged, total = [], 0, 0
    for q, ids in ranked.items():
        rel = []
        for i in ids:
            v = pool.get((q, i), "")
            total += 1
            if v in ("0", "1"):
                judged += 1
            rel.append(v == "1")
        rel = np.asarray(rel, dtype=bool)
        n_rel_known = sum(1 for (qq, _), v in pool.items() if qq == q and v == "1")
        row = {"query_id": q}
        for k in k_list:
            row[f"P@{k}"] = float(rel[:k].mean()) if len(rel) else float("nan")
            row[f"nDCG@{k}"] = M.ndcg(rel, k, max(n_rel_known, int(rel[:k].sum())))
        rows.append(row)
    summary = {key: M.nanmean([r[key] for r in rows]) for key in rows[0] if key != "query_id"} if rows else {}
    summary["judged_fraction"] = judged / total if total else float("nan")
    return {"summary": summary, "per_query": rows}


def write_judge_html(path: Path, title: str, queries: dict[str, str], ranked: dict[str, list[str]],
                     pool: dict, image_path) -> int:
    """Trang xem các cặp CHƯA chấm, nhóm theo query (ảnh qua file://)."""
    parts = [f"<!doctype html><meta charset=utf-8><title>{html.escape(title)}</title>",
             "<style>body{font-family:system-ui;margin:24px}figure{display:inline-block;margin:4px;"
             "width:180px;font-size:11px;vertical-align:top}img{width:180px;height:180px;object-fit:cover}"
             "h2{margin-top:32px}</style>", f"<h1>{html.escape(title)}</h1>",
             "<p>Điền cột <b>relevant</b> (1/0) trong judgments.csv cho các cặp dưới đây.</p>"]
    count = 0
    for q, ids in ranked.items():
        todo = [i for i in ids if pool.get((q, i), "") not in ("0", "1")]
        if not todo:
            continue
        parts.append(f"<h2>{html.escape(q)} — {html.escape(queries.get(q, ''))}</h2>")
        for i in todo:
            src = Path(image_path(i)).resolve().as_uri()
            parts.append(f"<figure><img loading=lazy src='{src}'><figcaption>{i}</figcaption></figure>")
            count += 1
    path.write_text("\n".join(parts), encoding="utf-8")
    return count
