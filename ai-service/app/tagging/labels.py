"""Nhãn chi tiết (Open Images V7, 174 lớp) — danh mục + probe tuyến tính trên vector CLIP.

Danh mục (`labels.csv`): id, tên en/vi/ja, nhóm hiển thị (section). Probe do
`experiments export_tags` xuất từ run `probe` (train trên split train của OI,
ngưỡng + calibrator chọn trên val): `<dir>/oi-<config>.npz`. Xác suất trả ra đã
calibrate (isotonic) → hiển thị được dưới dạng %, ngưỡng cũng ở thang xác suất.
"""
from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.tagging.classifiers import sigmoid

LABELS_CSV = Path(__file__).resolve().parent / "labels.csv"
LABEL_PREFIX = "oi."
# Thứ tự nhóm trong UI (AI Studio) — tên nhóm ở i18n FE `studio.sections.<id>`.
SECTIONS = ("people", "animals", "food", "nature", "beach", "sky", "city", "architecture",
            "vehicles", "sports", "events", "home", "tech", "fashion", "documents")
MODE_SIGMOID, MODE_CLASS, MODE_GLOBAL = 0, 1, 2


@lru_cache
def label_catalog() -> list[dict]:
    with LABELS_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(line for line in f if not line.startswith("#")))
    unknown = {r["section"] for r in rows} - set(SECTIONS)
    if unknown:
        raise ValueError(f"labels.csv có section lạ: {sorted(unknown)}")
    return rows


def calibrate(S: np.ndarray, arrays) -> np.ndarray:
    """Điểm probe (N, C) → xác suất: isotonic riêng lớp / isotonic chung (điểm − ngưỡng) / sigmoid."""
    mode, shift, ptr = arrays["cal_mode"], arrays["cal_shift"], arrays["cal_ptr"]
    xs, ys = arrays["cal_x"], arrays["cal_y"]
    P = sigmoid(S).astype(np.float32)
    for c in range(S.shape[1]):
        if mode[c] == MODE_CLASS:
            lo, hi = int(ptr[c]), int(ptr[c + 1])
            P[:, c] = np.interp(S[:, c], xs[lo:hi], ys[lo:hi])
        elif mode[c] == MODE_GLOBAL:
            P[:, c] = np.interp(S[:, c] - shift[c], arrays["global_x"], arrays["global_y"])
    return P


class LabelProbe:
    """Probe 174 nhãn trên vector CLIP (unit-norm, cùng tiền xử lý với backend)."""

    def __init__(self, path: Path) -> None:
        data = np.load(path, allow_pickle=False)
        self.meta = json.loads(str(data["meta"]))
        self.arrays = {k: data[k] for k in data.files if k != "meta"}
        self.source = path.stem
        self.thresholds = self.arrays["thresholds"].astype(np.float32)

    @property
    def clip_model(self) -> str:
        return self.meta["clip_model"]

    @property
    def classes(self) -> list[str]:
        return self.meta["classes"]

    def predict(self, X: np.ndarray) -> np.ndarray:
        a = self.arrays
        S = ((X - a["mean"]) / a["std"]) @ a["W"] + a["b"]
        return calibrate(S, a)


def load_label_probe(directory: Path, config: str, clip_model: str) -> LabelProbe | None:
    """Probe nhãn chi tiết khớp CLIP đang chạy và danh mục labels.csv; không có → None."""
    names = [r["oi_name"] for r in label_catalog()]
    for path in (directory / clip_model / f"oi-{config}.npz", directory / f"oi-{config}.npz"):
        if not path.exists():
            continue
        probe = LabelProbe(path)
        if probe.clip_model == clip_model and probe.classes == names:
            return probe
    return None
