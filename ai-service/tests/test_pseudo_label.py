"""Nhãn giả cho yolo_ft --pseudo-label (experiments/pseudo_label.py) — logic thuần, không cần model."""
from pathlib import Path

import numpy as np

from experiments import pseudo_label as PL
from experiments.oi_data import OISubset

CLASSES = [
    {"oi_name": "Person", "coco": "person"},
    {"oi_name": "Mug", "coco": "cup"},
    {"oi_name": "Coffee cup", "coco": "cup"},
    {"oi_name": "Coffee (drink)", "coco": ""},
    {"oi_name": "Van", "coco": ""},
    {"oi_name": "Truck", "coco": "truck"},
]
for c in CLASSES:
    c.update(group="object", boxable=True, prompt=c["oi_name"].lower())
PERSON, MUG, COFFEE_CUP, COFFEE, VAN, TRUCK = range(6)
OBJ = list(range(6))
BOX = [0.1, 0.1, 0.5, 0.5]
FAR = [0.6, 0.6, 0.9, 0.9]


def subset(rows: list[tuple[list[int], list]]) -> OISubset:
    """rows = [(Y của ảnh, box người)] → OISubset giả."""
    ids = [f"img{i}" for i in range(len(rows))]
    Y = np.array([y for y, _ in rows], dtype=np.int8)
    boxes = {i: b for i, (_, b) in zip(ids, rows) if b}
    return OISubset("train", ids, Y, CLASSES, Path("/nonexistent"), np.ones((len(ids), 2)), boxes)


def det(name, conf, box=BOX):
    return {"class_name": name, "confidence": conf, "bbox": list(box)}


THR = {k: {"threshold": 0.5} for k in ("person", "cup", "truck")}
ALLOWED = {frozenset(("Coffee cup", "Coffee (drink)"))}
U = -1  # chưa xác minh


def run_case(y, human, dets):
    sub = subset([(y, human)])
    return PL.pseudo_boxes(sub, {"img0": dets}, PL.coco_targets(CLASSES, OBJ), THR, ALLOWED)


def test_adds_box_only_for_unverified_class():
    res = run_case([0, 0, 0, 0, 0, U], [], [det("truck", 0.9)])
    assert res.boxes == {"img0": [[TRUCK, *BOX, 0]]}
    assert run_case([0, 0, 0, 0, 0, 0], [], [det("truck", 0.9)]).boxes == {}  # negative đã xác minh
    assert run_case([0, 0, 0, 0, 0, U], [], [det("truck", 0.4)]).boxes == {}  # dưới ngưỡng


def test_positive_class_keeps_human_boxes():
    human = [[PERSON, *BOX, 0]]
    res = run_case([1, 0, 0, 0, 0, 0], human, [det("person", 0.9), det("person", 0.8, FAR)])
    assert res.boxes == {}
    assert res.skipped == {"đã có box người": 1, "lớp đã xác minh (positive đủ box / negative)": 1}


def test_cup_resolved_by_verified_labels():
    # Mug negative, Coffee cup chưa xác minh → box cup là Coffee cup
    res = run_case([0, 0, U, 0, 0, 0], [], [det("cup", 0.9)])
    assert res.boxes == {"img0": [[COFFEE_CUP, *BOX, 0]]} and not res.ambiguous
    # Mug positive (box ở chỗ khác) → box cup không phải Mug → Coffee cup
    res = run_case([1, 1, U, 0, 0, 0], [[MUG, *FAR, 0]], [det("cup", 0.9)])
    assert res.boxes == {"img0": [[COFFEE_CUP, *BOX, 0]]}


def test_cup_ambiguous_goes_to_clip():
    res = run_case([0, U, U, 0, 0, 0], [], [det("cup", 0.9)])
    assert res.boxes == {} and res.ambiguous == [("img0", 0.9, BOX, [MUG, COFFEE_CUP])]


def test_overlap_with_other_class():
    # box truck của YOLO gốc đè box Van của người → bỏ
    res = run_case([0, 0, 0, 0, 1, U], [[VAN, *BOX, 0]], [det("truck", 0.9)])
    assert res.boxes == {} and res.skipped == {"trùng box lớp khác": 1}
    # ly ↔ đồ uống trong ly: cặp cho phép → vẫn thêm
    res = run_case([0, 0, U, 1, 0, 0], [[COFFEE, *BOX, 0]], [det("cup", 0.9)])
    assert res.boxes == {"img0": [[COFFEE_CUP, *BOX, 0]]}


def test_only_ids_and_merge():
    sub = subset([([0, 0, 0, 0, 0, U], [[PERSON, *FAR, 0]]), ([0, 0, 0, 0, 0, U], [])])
    dets = {"img0": [det("truck", 0.9)], "img1": [det("truck", 0.9)]}
    res = PL.pseudo_boxes(sub, dets, PL.coco_targets(CLASSES, OBJ), THR, ALLOWED, only_ids={"img0"})
    assert set(res.boxes) == {"img0"}
    merged = PL.merge_boxes(sub, res.boxes)
    assert len(merged.boxes["img0"]) == 2 and len(sub.boxes["img0"]) == 1  # bản gốc không đổi


def test_box_thresholds_precision_target():
    # 12 ảnh val Truck positive (1 box người), 3 ảnh Truck negative (detection = FP), 1 ảnh chưa xác minh (không tính)
    rows = [([0, 0, 0, 0, 0, 1], [[TRUCK, *BOX, 0]]) for _ in range(12)]
    rows += [([0, 0, 0, 0, 0, 0], []) for _ in range(3)] + [([0, 0, 0, 0, 0, U], [])]
    val = subset(rows)
    dets = {f"img{i}": [det("truck", 0.9 - 0.01 * i)] for i in range(12)}
    dets.update({f"img{i}": [det("truck", s)] for i, s in ((12, 0.95), (13, 0.5), (14, 0.3))})
    dets["img15"] = [det("truck", 0.99)]
    thr = PL.box_thresholds(val, dets, PL.coco_targets(CLASSES, OBJ), 0.9, 10)
    t = thr["truck"]
    # thứ tự: 0.95 FP, 0.90…0.79 TP×12, 0.5 FP, 0.3 FP → cắt thấp nhất đạt P ≥ 0.9 là 0.79 (12/13)
    assert t["reached"] and abs(t["threshold"] - 0.79) < 1e-9 and t["tp"] == 12 and t["val_dets"] == 15
    assert not thr["cup"]["reached"] and thr["cup"]["threshold"] == float("inf")


def test_overlap_csv_names_exist_in_mapping():
    import csv

    from experiments.core import PACKAGE_DATA

    lines = [ln for ln in open(PACKAGE_DATA / "oi_classes.csv") if not ln.startswith("#")]
    names = {r["oi_name"] for r in csv.DictReader(lines)}
    allowed = PL.read_overlap_allowed()
    assert allowed and all(n in names for pair in allowed for n in pair)
