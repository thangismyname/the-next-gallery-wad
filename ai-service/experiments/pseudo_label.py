"""Nhãn giả (pseudo-label) cho tập TRAIN của `yolo_ft --pseudo-label`: YOLO gốc (COCO) lấp box còn thiếu.

Vấn đề: Open Images chỉ vẽ box cho lớp đã XÁC MINH có trong ảnh. Vật thể COCO có trong ảnh mà lớp của nó
chưa xác minh (Y = −1) không có box → khi train YOLO thành "nền" → model quên lớp COCO (yolo_ft lần 1:
Truck 0.69 → 0.35, Teddy bear 0.77 → 0.36). Nhãn giả chỉ lấp đúng các chỗ đó, không đè nhãn người:

  Trạng thái lớp c trong ảnh   box YOLO gốc của c (conf ≥ ngưỡng của c)
  ─────────────────────────    ──────────────────────────────────────────
  positive (Y = 1)             bỏ — người đã vẽ box (box lớp con đã cộng cho lớp cha khi build, vd Van → Car)
  negative (Y = 0)             bỏ — người xác nhận không có → YOLO gốc sai
  chưa xác minh (Y = −1)       THÊM box giả

Ngưỡng theo từng lớp COCO, chọn trên VAL theo giao thức OI (chỉ ảnh đã xác minh, group-of = 1 GT): ngưỡng
thấp nhất mà precision của box ≥ `precision_target` và có ≥ `min_tp` box đúng; lớp không đạt → không gắn.

Lớp COCO ứng với nhiều lớp OI (cup → Mug / Coffee cup):
  (a) loại lớp đích negative, và lớp đích positive (box người đã đủ — box giả không trùng box nào của lớp đó
      thì không phải lớp đó); box giả trùng box người của một lớp đích → bỏ (đã có nhãn).
  (b) còn > 1 lớp đích → CLIP zero-shot trên vùng cắt box, nhận nếu xác suất ≥ `clip_min`, không thì bỏ.

Xung đột: box giả trùng (IoU ≥ `overlap_iou`) box người hoặc box giả đã nhận của lớp khác → bỏ, trừ cặp trong
`data/pseudo_overlap_allowed.csv` (ly ↔ đồ uống, người ↔ mặt…). Box giả xét theo conf giảm dần.

Chỉ dùng cho split train — val (chọn epoch) và test (báo cáo) giữ nguyên nhãn người.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field

import numpy as np

from experiments import metrics as M
from experiments.core import PACKAGE_DATA
from experiments.oi_data import OISubset

OVERLAP_ALLOWED_PATH = PACKAGE_DATA / "pseudo_overlap_allowed.csv"
CLIP_TEMPLATES = ["a photo of a {}.", "a close-up photo of a {}."]


def read_overlap_allowed(path=OVERLAP_ALLOWED_PATH) -> set[frozenset[str]]:
    lines = [ln for ln in open(path, encoding="utf-8") if ln.strip() and not ln.startswith("#")]
    return {frozenset((r["a"].strip(), r["b"].strip())) for r in csv.DictReader(lines)}


def coco_targets(classes: list[dict], obj: list[int]) -> dict[str, list[int]]:
    """Lớp COCO → các lớp OI (vật thể có box, trong `obj`) mà nó map tới."""
    out: dict[str, list[int]] = {}
    for j in obj:
        if classes[j].get("coco"):
            out.setdefault(classes[j]["coco"], []).append(j)
    return out


def _iou1(a, b) -> float:
    return float(M._iou(np.asarray(a, np.float64), np.asarray([b], np.float64))[0])


# ── ngưỡng theo precision của box trên val ───────────────────────────────
def box_thresholds(val: OISubset, dets: dict, targets: dict[str, list[int]], precision_target: float,
                   min_tp: int, iou: float = 0.5) -> dict[str, dict]:
    """Lớp COCO → {threshold, precision, recall, tp, val_dets, reached}. GT = hợp box các lớp đích; ảnh tính
    khi đã xác minh (1 lớp đích positive, hoặc mọi lớp đích negative) — ảnh chưa xác minh không tính FP."""
    out = {}
    for k, T in targets.items():
        Yt = val.Y[:, T]
        verified = (Yt == 1).any(axis=1) | (Yt == 0).all(axis=1)
        det_list, gts = [], {}
        for i in np.flatnonzero(verified):
            img = val.image_ids[i]
            det_list += [(int(i), d["confidence"], d["bbox"]) for d in dets.get(img, []) if d["class_name"] == k]
            boxes = [b for b in val.boxes.get(img, []) if b[0] in T]
            normal = np.asarray([b[1:5] for b in boxes if not b[5]], np.float64).reshape(-1, 4)
            group = np.asarray([b[1:5] for b in boxes if b[5]], np.float64).reshape(-1, 4)
            if len(normal) or len(group):
                gts[int(i)] = (normal, group)
        scores, flags, n_gt = M.detection_matches(det_list, gts, iou)
        row = {"threshold": float("inf"), "precision": float("nan"), "recall": float("nan"), "tp": 0,
               "val_dets": int(len(scores)), "val_gt": int(n_gt), "reached": False}
        if len(scores) and n_gt:
            tp = np.cumsum(flags == 1)
            prec = tp / np.arange(1, len(flags) + 1)
            last_of_tie = np.r_[scores[1:] != scores[:-1], True]  # chỉ cắt ở cuối nhóm điểm bằng nhau
            ok = np.flatnonzero((prec >= precision_target) & (tp >= min_tp) & last_of_tie)
            if len(ok):
                c = int(ok[-1])  # cắt thấp nhất còn đạt precision → nhiều box nhất
                row.update(threshold=float(scores[c]), precision=float(prec[c]), recall=float(tp[c] / n_gt),
                           tp=int(tp[c]), reached=True)
        out[k] = row
    return out


# ── gắn nhãn giả ──────────────────────────────────────────────────────────
@dataclass
class PseudoResult:
    boxes: dict[str, list] = field(default_factory=dict)       # id → box giả [c, x1, y1, x2, y2, 0] (đã nhận)
    ambiguous: list[tuple] = field(default_factory=list)       # (id, conf, bbox, [lớp đích còn lại])
    skipped: dict[str, int] = field(default_factory=dict)      # lý do bỏ → số box

    def skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1


def _conflicts(box, cls: int, others: list, names: list[str], allowed: set, overlap_iou: float) -> bool:
    return any(o[0] != cls and frozenset((names[cls], names[int(o[0])])) not in allowed
               and _iou1(box, o[1:5]) >= overlap_iou for o in others)


def pseudo_boxes(sub: OISubset, dets: dict, targets: dict[str, list[int]], thr: dict[str, dict],
                 allowed: set[frozenset[str]], overlap_iou: float = 0.7, gt_iou: float = 0.5,
                 only_ids: set[str] | None = None) -> PseudoResult:
    """Box giả cho `sub` (bước a). Box còn nhiều lớp đích → `ambiguous` (bước b: `resolve_with_clip`)."""
    names = [c["oi_name"] for c in sub.classes]
    res = PseudoResult()
    for i, img in enumerate(sub.image_ids):
        if only_ids is not None and img not in only_ids:
            continue
        human = sub.boxes.get(img, [])
        added: list = []
        for d in sorted(dets.get(img, []), key=lambda d: -d["confidence"]):
            T = targets.get(d["class_name"])
            if not T or d["confidence"] < thr[d["class_name"]]["threshold"]:
                continue
            box = d["bbox"]
            if any(b[0] in T and (_iou1(box, b[1:5]) >= gt_iou or (b[5] and M._ioa(np.asarray(box, np.float64),
                   np.asarray([b[1:5]], np.float64))[0] >= gt_iou)) for b in human):
                res.skip("đã có box người")
                continue
            cand = [t for t in T if sub.Y[i, t] == -1]
            if not cand:
                res.skip("lớp đã xác minh (positive đủ box / negative)")
                continue
            cand = [t for t in cand if not _conflicts(box, t, human + added, names, allowed, overlap_iou)]
            if not cand:
                res.skip("trùng box lớp khác")
                continue
            if len(cand) > 1:
                res.ambiguous.append((img, d["confidence"], box, cand))
                continue
            b = [cand[0], *box, 0]
            added.append(b)
        if added:
            res.boxes[img] = added
    return res


def resolve_with_clip(res: PseudoResult, sub: OISubset, clip_spec: str, device: str, clip_min: float,
                      allowed: set[frozenset[str]], overlap_iou: float = 0.7, run=None) -> list[dict]:
    """Bước (b): CLIP zero-shot trên vùng cắt của box còn nhiều lớp đích. Nhận nếu xác suất ≥ clip_min.
    Sửa `res.boxes` tại chỗ; trả bảng từng box (để báo cáo)."""
    if not res.ambiguous:
        return []
    from PIL import Image

    from experiments.features import clip_provider, logit_scale, prompt_embeddings

    names = [c["oi_name"] for c in sub.classes]
    prompts = {j: (c.get("prompt") or c["oi_name"]) for j, c in enumerate(sub.classes)}
    model = clip_provider(clip_spec, device)
    scale = logit_scale(clip_spec, device)
    paths = dict(zip(sub.image_ids, sub.paths()))
    rows = []
    for n, (img, conf, box, cand) in enumerate(res.ambiguous):
        with Image.open(paths[img]) as im:
            im = im.convert("RGB")
            W, H = im.size
            x1, y1, x2, y2 = box
            crop = im.crop((max(0, int(x1 * W)), max(0, int(y1 * H)), min(W, int(np.ceil(x2 * W))),
                            min(H, int(np.ceil(y2 * H)))))
        buf = io.BytesIO()
        crop.save(buf, "JPEG", quality=95)
        f = model.encode_images([buf.getvalue()])[0]
        E = prompt_embeddings(clip_spec, [prompts[t] for t in cand], CLIP_TEMPLATES, device)
        logits = scale * (E @ f)
        prob = np.exp(logits - logits.max())
        prob /= prob.sum()
        best = int(np.argmax(prob))
        t = cand[best]
        accepted = bool(prob[best] >= clip_min)
        others = [b for b in sub.boxes.get(img, [])] + res.boxes.get(img, [])
        if accepted and _conflicts(box, t, others, names, allowed, overlap_iou):
            accepted = False
        if accepted:
            res.boxes.setdefault(img, []).append([t, *box, 0])
        else:
            res.skip("CLIP không chắc")
        rows.append({"image": img, "yolo_conf": conf, "candidates": ";".join(names[c] for c in cand),
                     "clip_class": names[t], "clip_prob": float(prob[best]), "accepted": accepted})
        if run:
            run.progress(n + 1, len(res.ambiguous), "CLIP phân định box nhiều lớp đích")
    return rows


def merge_boxes(sub: OISubset, extra: dict[str, list]) -> OISubset:
    """Bản sao subset với box người + box giả (box giả không phải group-of)."""
    from dataclasses import replace

    boxes = {k: list(v) for k, v in sub.boxes.items()}
    for img, bs in extra.items():
        boxes.setdefault(img, []).extend(bs)
    return replace(sub, boxes=boxes)
