"""Classification bench trên dữ liệu giả — không cần dataset/model thật."""
import json
from pathlib import Path

import numpy as np
import pytest

from bench import cls_features
from bench.cls_data import ClsDataset, load_coco_tags, load_places6, stable_split
from bench.cls_models import (
    LinearProbe,
    YoloRule,
    ZeroShotClip,
    ece,
    load_model,
    multilabel_metrics,
    save_model,
    single_label_metrics,
    tune_thresholds,
)
from bench.cls_prelabel import merge_entry
from bench.cls_taxonomy import (
    OBJECT_TAGS,
    SCENE_TAGS,
    TAG_IDS,
    TAGS,
    coco_tags_for,
    places_to_tag,
)


def test_taxonomy_is_consistent():
    assert len(TAG_IDS) == 17 and len(set(TAG_IDS)) == 17
    for tag in TAGS:
        assert tag["prompts"] and tag["vi"] and tag["definition"]
        assert (tag["group"] == "object") == ("coco" in tag)
        assert (tag["group"] == "scene") == ("places" in tag)
    mapping = places_to_tag()  # raise nếu 1 cảnh thuộc 2 tag
    assert set(mapping.values()) == set(SCENE_TAGS)


def ann(cat, area, crowd=False):
    return {"category": cat, "area_frac": area, "iscrowd": crowd}


def test_coco_rules():
    assert coco_tags_for([ann("person", 0.3)], 640, 480) == {"portrait"}
    assert coco_tags_for([ann("person", 0.05)], 640, 480) == set()  # người quá nhỏ
    assert "group" in coco_tags_for([ann("person", 0.1)] * 3, 640, 480)
    assert "group" in coco_tags_for([ann("person", 0.4, crowd=True)], 640, 480)
    assert coco_tags_for([ann("dog", 0.1)], 1, 1) == {"pets"}
    assert coco_tags_for([ann("dog", 0.001)], 1, 1) == set()
    assert coco_tags_for([ann("pizza", 0.03), ann("cake", 0.03)], 1, 1) == {"food"}  # tổng ≥5%
    assert coco_tags_for([ann("sports ball", 0.0001)], 1, 1) == {"sports"}


def test_stable_split_is_deterministic_and_balanced():
    names = [f"img_{i}.jpg" for i in range(5000)]
    splits = [stable_split(n) for n in names]
    assert splits == [stable_split(n) for n in names]
    frac = {s: splits.count(s) / len(splits) for s in ("train", "val", "test")}
    assert abs(frac["train"] - 0.6) < 0.03 and abs(frac["test"] - 0.2) < 0.03


OFFICIAL_PLACES = Path(__file__).parent / "data" / "categories_places365.txt"


def test_places_mapping_matches_official_category_list():
    official = OFFICIAL_PLACES.read_text().split()
    assert len(official) == 365
    assert set(places_to_tag()) <= set(official)


def test_places_and_coco_loaders(tmp_path):
    places = tmp_path / "places365"
    (places / "val_256").mkdir(parents=True)
    names = OFFICIAL_PLACES.read_text().split()
    (places / "categories_places365.txt").write_text("".join(f"{n} {i}\n" for i, n in enumerate(names)))
    beach, airfield, mountain = (names.index(n) for n in ("/b/beach", "/a/airfield", "/m/mountain"))
    (places / "places365_val.txt").write_text(f"a.jpg {beach}\nb.jpg {airfield}\nc.jpg {mountain}\n")
    ds = load_places6(tmp_path)
    assert ds.files == ["val_256/a.jpg", "val_256/c.jpg"]  # airfield không thuộc tag nào
    assert ds.single_label and ds.Y.sum(1).tolist() == [1, 1]
    assert ds.Y[0, SCENE_TAGS.index("beach")] and ds.Y[1, SCENE_TAGS.index("mountain")]

    coco = tmp_path / "coco" / "annotations"
    coco.mkdir(parents=True)
    coco.joinpath("instances_val2017.json").write_text(json.dumps({
        "categories": [{"id": 1, "name": "person"}, {"id": 18, "name": "dog"}],
        "images": [{"id": 1, "file_name": "x.jpg", "width": 100, "height": 100},
                   {"id": 2, "file_name": "y.jpg", "width": 100, "height": 100}],
        "annotations": [{"image_id": 1, "category_id": 18, "bbox": [0, 0, 50, 50]},
                        {"image_id": 1, "category_id": 1, "bbox": [0, 0, 60, 60]}],
    }))
    cd = load_coco_tags(tmp_path)
    assert cd.files == ["images/val2017/x.jpg", "images/val2017/y.jpg"]
    row = dict(zip(OBJECT_TAGS, cd.Y[0]))
    assert row["pets"] and row["portrait"] and not cd.Y[1].any()


def test_metrics():
    Y = np.array([[1, 0], [1, 0], [0, 1], [0, 0]], dtype=bool)
    perfect = Y.astype(float)
    m = multilabel_metrics(perfect, Y, np.full(2, 0.5), ["a", "b"])
    assert m["mAP"] == 100.0 and m["macro_f1"] == 100.0 and m["ece"] == 0.0
    thr = tune_thresholds(np.array([[0.9, 0.1], [0.6, 0.2], [0.2, 0.7], [0.3, 0.1]]), Y)
    assert 0.3 < thr[0] <= 0.6 and 0.2 < thr[1] <= 0.7
    S = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=bool)
    sm = single_label_metrics(np.array([[0.8, 0.1, 0.1], [0.2, 0.7, 0.1], [0.6, 0.3, 0.1]]), S)
    assert sm["top1"] == pytest.approx(66.67) and sm["top2"] == pytest.approx(66.67)
    # Luôn tự tin 100% nhưng chỉ đúng một nửa → ECE 50%.
    assert ece(np.ones(4), np.array([1, 0, 1, 0])) == 50.0


def test_linear_probe_learns_and_roundtrips(tmp_path):
    rng = np.random.default_rng(0)
    X = rng.normal(size=(400, 8)).astype(np.float32)
    Y = np.stack([X[:, 0] > 0, X[:, 1] + X[:, 2] > 0.5], axis=1)
    feats = {"clip": X[:, :4], "dino": X[:, 4:]}
    probe = LinearProbe.fit(["a", "b"], ("clip", "dino"), False,
                            {k: v[:300] for k, v in feats.items()}, Y[:300],
                            {k: v[300:] for k, v in feats.items()}, Y[300:])
    P = probe.predict({k: v[300:] for k, v in feats.items()})
    assert multilabel_metrics(P, Y[300:], np.full(2, 0.5))["mAP"] > 90
    probe.thresholds = np.array([0.4, 0.6])
    save_model(tmp_path / "m.npz", probe, {"trained_on": "fake"})
    loaded, meta = load_model(tmp_path / "m.npz")
    assert meta["trained_on"] == "fake" and loaded.thresholds.tolist() == [0.4, 0.6]
    assert np.allclose(loaded.predict({k: v[300:] for k, v in feats.items()}), P)

    single = LinearProbe.fit(["a", "b"], ("clip",), True, {"clip": X[:300, :4]},
                             np.stack([Y[:300, 0], ~Y[:300, 0]], 1), {"clip": X[300:, :4]},
                             np.stack([Y[300:, 0], ~Y[300:, 0]], 1))
    assert np.allclose(single.predict({"clip": X[:5, :4]}).sum(1), 1.0)


class FakeClip:
    logit_scale = 10.0  # nhỏ để sigmoid không bão hoà về 1.0

    def encode_texts(self, texts):
        import hashlib  # seed cố định (hash() của Python đổi theo mỗi lần chạy)

        rng = np.random.default_rng(int(hashlib.md5(texts[0].encode()).hexdigest()[:8], 16))
        v = rng.normal(size=(len(texts), 16))
        return v / np.linalg.norm(v, axis=1, keepdims=True)


def test_zero_shot_and_yolo_rule(tmp_path):
    zs = ZeroShotClip.build(FakeClip(), ["beach", "night"], single_label=False)
    X = np.vstack([zs.pos[0], zs.pos[1]])
    P = zs.predict({"clip": X})
    assert P[0, 0] > P[0, 1] and P[1, 1] > P[1, 0]
    save_model(tmp_path / "zs.npz", zs)
    loaded, _ = load_model(tmp_path / "zs.npz")
    assert np.allclose(loaded.predict({"clip": X}), P)

    names = ["person", "dog", "pizza"]
    rule = YoloRule(["portrait", "group", "pets", "food"], names)
    k = len(names)
    vec = np.zeros((1, 3 * k), dtype=np.float32)
    vec[0, 1], vec[0, k + 1], vec[0, 2 * k + 1] = np.log1p(1), 0.9, 0.2  # 1 con chó to
    P = rule.predict({"yolo": vec})
    assert P[0, 2] == pytest.approx(0.9) and P[0, 0] == 0 and P[0, 3] == 0


def test_feature_cache_reuses_superset(tmp_path, monkeypatch):
    calls = []

    def fake_extract(kind, paths, *a):
        calls.append(len(paths))
        return np.arange(len(paths), dtype=np.float32)[:, None], None, 0.1

    monkeypatch.setattr(cls_features, "extract", fake_extract)
    full = ClsDataset("g", tmp_path, ["a", "b", "c"], ["x"], np.zeros((3, 1), bool), np.array(["test"] * 3))
    sub = ClsDataset("g", tmp_path, ["c", "a"], ["x"], np.zeros((2, 1), bool), np.array(["test"] * 2))
    assert cls_features.load_features(full, "clip", tmp_path).ravel().tolist() == [0, 1, 2]
    assert cls_features.load_features(sub, "clip", tmp_path).ravel().tolist() == [2, 0]
    assert calls == [3]  # tập con dùng lại cache, không trích lại


def test_prelabel_merge_keeps_reviewed_labels():
    new = {"file": "a.jpg", "sha256": "s1", "predicted": {"beach": 0.9}, "suggested": ["beach"],
           "labels": ["beach"], "status": "auto", "notes": "", "reviewed_at": None}
    reviewed = {**new, "labels": ["beach", "sunset"], "status": "reviewed", "notes": "ok",
                "reviewed_at": "2026-10-24T00:00:00Z", "predicted": {"beach": 0.1}}
    merged = merge_entry(reviewed, new)
    assert merged["labels"] == ["beach", "sunset"] and merged["status"] == "reviewed"
    assert merged["predicted"] == {"beach": 0.9}  # dự đoán được làm mới
    assert merge_entry({**reviewed, "sha256": "other"}, new)["status"] == "auto"  # ảnh đổi nội dung
    assert merge_entry(None, new) is new


def test_eval_runner_system_and_prelabel_end_to_end(tmp_path, monkeypatch):
    """cls_eval (train + lưu model) → TagSystem → cls_prelabel, với feature giả."""
    import argparse
    import sys

    from PIL import Image

    from bench import cls_eval, cls_prelabel

    names = ["person", "cat", "dog", "pizza", "car"]
    dims = {"clip": 16, "dino": 8, "yolo": 3 * len(names)}

    def fake_features(ds, kind, *a, **k):
        rng = np.random.default_rng(len(ds.name) * 31 + dims[kind])
        X = rng.normal(size=(len(ds.files), dims[kind])).astype(np.float32)
        if kind != "yolo":  # tín hiệu học được: cột đầu = nhãn đầu
            X[:, 0] += 3 * ds.Y[:, 0]
        return X

    monkeypatch.setattr(cls_eval, "load_features", fake_features)
    monkeypatch.setattr(cls_prelabel, "load_features", fake_features)
    monkeypatch.setattr(cls_eval, "provider", lambda kind, device="auto": FakeClip())
    monkeypatch.setattr(cls_eval, "yolo_class_names", lambda device="auto": names)
    monkeypatch.setattr(cls_eval, "MODELS_OUT", tmp_path / "models")

    n = 200
    split = np.array([stable_split(str(i)) for i in range(n)])
    rng = np.random.default_rng(1)
    coco = ClsDataset("coco", tmp_path, [str(i) for i in range(n)], list(OBJECT_TAGS),
                      rng.random((n, len(OBJECT_TAGS))) < 0.3, split)
    y = rng.integers(0, len(SCENE_TAGS), n)
    places = ClsDataset("places6", tmp_path, [str(i) for i in range(n)], list(SCENE_TAGS),
                        np.eye(len(SCENE_TAGS), dtype=bool)[y], split, single_label=True)
    args = argparse.Namespace(data_root=tmp_path, image_preprocess="backend", device="cpu",
                              batch_size=8, workers=1, limit=None, bootstrap=50,
                              csv=tmp_path / "cls.csv", per_tag_csv=tmp_path / "tags.csv",
                              confusion_csv=tmp_path / "confusion.csv")
    for ds in (coco, places):
        cls_eval.run_split_dataset(ds, cls_eval.CONFIGS, args, {"taxonomy_version": "t"})
    assert (tmp_path / "models" / "coco-lp_all.npz").exists()
    assert (tmp_path / "models" / "places6-lp_all.npz").exists()
    import csv

    rows = list(csv.DictReader(open(tmp_path / "cls.csv")))
    assert len(rows) == len(cls_eval.CONFIGS) + len(cls_eval.CONFIGS) - 1  # yolo_rule bỏ ở T1
    for r in rows:  # mọi dòng có điểm val + CI bao quanh giá trị test
        key = "top1" if r["task"] == "T1" else "mAP"
        assert r["val_score"] != ""
        assert float(r[f"{key}_ci_lo"]) <= float(r[key]) <= float(r[f"{key}_ci_hi"])
    conf = list(csv.DictReader(open(tmp_path / "confusion.csv")))
    t1_configs = len(cls_eval.CONFIGS) - 1
    assert len(conf) == t1_configs * len(SCENE_TAGS) ** 2
    assert sum(int(r["count"]) for r in conf) == t1_configs * len(places.subset("test"))

    # "best" chọn đúng model có val_score cao nhất cho từng dataset (không nhìn test).
    for dataset in ("coco", "places6"):
        best_val = max(float(r["val_score"]) for r in rows
                       if r["dataset"] == dataset and r["config"] != "yolo_rule")
        _, meta = cls_eval.load_model(cls_eval.best_model_path(dataset))
        assert meta["val_score"] == pytest.approx(best_val)
    best_system = cls_eval.TagSystem("best")
    assert [src.split("-")[0] for _, _, src in best_system.parts] == ["coco", "places6", "attribute"]

    system = cls_eval.TagSystem("lp_all")
    feats = {k: np.zeros((3, d), np.float32) for k, d in dims.items()}
    P, thr = system.predict(feats)
    assert P.shape == (3, 17) and thr.shape == (17,) and ((P >= 0) & (P <= 1)).all()

    # pre-label: 2 ảnh, chạy 2 lần — lần 2 giữ nhãn đã duyệt.
    images = tmp_path / "gallery-gt" / "images" / "trip"
    images.mkdir(parents=True)
    for name in ("a.jpg", "b.jpg"):
        Image.new("RGB", (8, 8)).save(images / name)
    monkeypatch.setattr(sys, "argv", ["cls_prelabel", "--data-root", str(tmp_path)])
    assert cls_prelabel.main() == 0
    labels_file = tmp_path / "gallery-gt" / "labels.json"
    doc = json.loads(labels_file.read_text())
    assert [e["file"] for e in doc["images"]] == ["trip/a.jpg", "trip/b.jpg"]
    assert set(doc["images"][0]["predicted"]) == set(TAG_IDS)
    doc["images"][0].update(labels=["beach"], status="reviewed")
    labels_file.write_text(json.dumps(doc))
    assert cls_prelabel.main() == 0
    again = json.loads(labels_file.read_text())["images"][0]
    assert again["labels"] == ["beach"] and again["status"] == "reviewed"


def test_bootstrap_ci_and_confusion():
    from bench.cls_models import bootstrap_ci, confusion_rows

    rng = np.random.default_rng(0)
    Y = np.eye(3, dtype=bool)[rng.integers(0, 3, 300)]
    P = np.where(Y, 0.7, 0.15) + rng.normal(0, 0.2, Y.shape)  # đúng ~ đa số
    ci = bootstrap_ci(P, Y, True, n=200)
    assert ci["top1_ci_lo"] < ci["top1_ci_hi"] and ci["macro_f1_ci_lo"] < ci["macro_f1_ci_hi"]
    assert bootstrap_ci(P, Y, True, n=0) == {}
    rows = confusion_rows(P, Y, ["a", "b", "c"])
    assert len(rows) == 9 and sum(r["count"] for r in rows) == 300
    diag = sum(r["count"] for r in rows if r["true"] == r["pred"])
    assert diag == int((P.argmax(1) == Y.argmax(1)).sum())
