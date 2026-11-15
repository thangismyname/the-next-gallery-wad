"""Test cho experiments/ (E1–E6) — dữ liệu tổng hợp, không cần model / Open Images."""
from __future__ import annotations

import csv
import json

import numpy as np
import pytest

from experiments import metrics as M
from experiments import oi_data


# ── metrics ───────────────────────────────────────────────────────────────
def test_average_precision_matches_sklearn():
    from sklearn.metrics import average_precision_score

    rng = np.random.default_rng(0)
    for _ in range(20):
        s = rng.random(200)
        y = rng.random(200) < 0.2
        if y.any():
            assert M.average_precision(s, y) == pytest.approx(average_precision_score(y, s), abs=1e-9)


def test_tune_threshold_precision_target():
    s = np.array([0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
    y = np.array([1, 1, 0, 1, 0, 0], bool)
    free = M.tune_threshold(s, y)
    assert free["f1"] == pytest.approx(2 * 3 / (4 + 3))  # cắt ở 0.6
    strict = M.tune_threshold(s, y, precision_target=1.0)
    assert strict["threshold"] == 0.8 and strict["precision"] == 1.0 and strict["reached"]
    impossible = M.tune_threshold(np.array([0.5, 0.4]), np.array([0, 1], bool), precision_target=1.0)
    assert not impossible["reached"]


def test_calibrators_monotone_and_fallback():
    rng = np.random.default_rng(1)
    S = rng.random((300, 2))
    Y = np.stack([(S[:, 0] > 0.6).astype(np.int8), np.full(300, -1, np.int8)], axis=1)
    Y[:3, 1] = [1, 0, 0]  # lớp 2 ít mẫu → global
    cals = M.fit_calibrators(S, Y, np.array([0.6, 0.5]), min_count=10)
    assert [c["mode"] for c in cals["per_class"]] == ["class", "global"]
    P = M.apply_calibrators(np.sort(S, axis=0), cals)
    assert (np.diff(P[:, 0]) >= -1e-12).all() and P.min() >= 0 and P.max() <= 1


def test_ece_perfect_and_bad():
    assert M.ece(np.array([1.0, 0.0]), np.array([1, 0])) == pytest.approx(0)
    assert M.ece(np.array([1.0, 1.0]), np.array([0, 0])) == pytest.approx(1)


def test_detection_ap_group_of():
    gts = {0: (np.array([[0.0, 0.0, 0.5, 0.5]]), np.zeros((0, 4))),
           1: (np.zeros((0, 4)), np.array([[0.0, 0.0, 1.0, 1.0]]))}
    dets = [(0, 0.9, [0.0, 0.0, 0.5, 0.5]),     # TP
            (1, 0.8, [0.1, 0.1, 0.3, 0.3]),     # TP (group, lần đầu)
            (1, 0.7, [0.5, 0.5, 0.7, 0.7]),     # bỏ qua (cùng group)
            (0, 0.6, [0.6, 0.6, 0.9, 0.9])]     # FP
    r = M.detection_ap(dets, gts)
    assert r["n_gt"] == 2 and r["tp"] == 2 and r["fp"] == 1 and r["AP"] == pytest.approx(1.0)


def test_ranking_and_target_ranks():
    r = M.ranking_metrics(np.array([0.9, 0.8, 0.1]), np.array([0, 1, 1], bool), ks=(1, 2))
    assert r["P@1"] == 0 and r["R@2"] == 0.5 and r["RR"] == 0.5
    Q = np.eye(3, dtype=np.float32)
    ranks = M.target_ranks(Q, np.eye(3, dtype=np.float32), np.array([0, 1, 1]))
    assert ranks.tolist() == [1, 1, 2]


# ── Open Images: nhãn + cây lớp ───────────────────────────────────────────
def _write_annotations(root):
    ann = oi_data.annotations_dir(root)
    ann.mkdir(parents=True)
    (ann / "oidv7-class-descriptions.csv").write_text(
        "LabelName,DisplayName\n/m/a,Animal\n/m/d,Dog\n/m/c,Cat\n/m/b,Beach\n/m/o,Orange\n/m/o2,Orange\n")
    (ann / "oidv7-class-descriptions-boxable.csv").write_text(
        "LabelName,DisplayName\n/m/a,Animal\n/m/d,Dog\n/m/c,Cat\n/m/o,Orange\n")
    (ann / "bbox_labels_600_hierarchy.json").write_text(json.dumps(
        {"LabelName": "/m/root", "Subcategory": [{"LabelName": "/m/a", "Subcategory": [
            {"LabelName": "/m/d"}, {"LabelName": "/m/c"}]}]}))
    rows = [("i1", "/m/d", 1), ("i2", "/m/a", 0), ("i3", "/m/c", 0), ("i3", "/m/b", 1), ("i4", "/m/o", 1)]
    for _split, name in (("validation", "oidv7-val-annotations-human-imagelabels.csv"),
                        ("test", "oidv7-test-annotations-human-imagelabels.csv")):
        with open(ann / name, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["ImageID", "Source", "LabelName", "Confidence"])
            for r in rows:
                w.writerow([r[0], "verification", r[1], r[2]])


def _mapping(tmp_path, names):
    path = tmp_path / "map.csv"
    path.write_text("# comment\noi_name,oi_mid,group,coco,old_tag,prompt\n" +
                    "".join(f"{n},,{g},{c},,\n" for n, g, c in names))
    return path


def test_resolve_and_derive_labels(tmp_path):
    _write_annotations(tmp_path)
    mp = _mapping(tmp_path, [("Animal", "object", ""), ("Dog", "object", "dog"),
                             ("Beach", "scene", ""), ("Orange", "object", "orange")])
    classes = oi_data.resolve_classes(tmp_path, mp)
    assert classes[3]["oi_mid"] == "/m/o"  # trùng tên → chọn bản boxable
    labels = oi_data.stream_image_labels(tmp_path, "validation", oi_data.relevant_mids(classes))
    y = {i: oi_data.derive_labels(v, classes).tolist() for i, v in labels.items()}
    assert y["i1"] == [1, 1, -1, -1]     # Dog ⇒ Animal positive
    assert y["i2"] == [0, 0, -1, -1]     # Animal negative ⇒ Dog negative
    assert y["i3"] == [-1, -1, 1, -1]    # Cat negative không nói gì về Animal
    ids, Y = oi_data.select_subset(labels, classes, n_images=2, min_pos=1, exclude=set(), seed=0)
    assert len(ids) == 2 and (Y == 1).any(axis=0).sum() >= 2


def test_select_train_split(tmp_path):
    """select --splits train: chỉ ảnh boxable, bỏ ảnh xoay, không đụng file val/test."""
    from experiments import prepare

    _write_annotations(tmp_path)
    ann = oi_data.annotations_dir(tmp_path)
    with open(ann / "oidv7-train-annotations-human-imagelabels.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ImageID", "Source", "LabelName", "Confidence"])
        for i in range(12):
            w.writerow([f"t{i:02d}", "verification", "/m/d" if i % 2 else "/m/b", 1])
        w.writerow(["t00", "machine", "/m/d", 1])  # nhãn máy → bỏ
    # boxable: t00…t09 (t10, t11 không boxable); t01 bị xoay
    (ann / "train-images-boxable-with-rotation.csv").write_text(
        "ImageID,Subset,OriginalURL,Rotation\n" + "".join(
            f"t{i:02d},train,u,{90.0 if i == 1 else 0.0}\n" for i in range(10)))
    mp = _mapping(tmp_path, [("Dog", "object", "dog"), ("Beach", "scene", "")])
    out = prepare.run_select(prepare.SelectParams(
        data_root=str(tmp_path), splits=["train"], n_train=100, min_pos_train=1, mapping=str(mp),
        train_pool_fraction=1.0))
    info = out["splits"]["train"]
    sub = oi_data.subset_dir(tmp_path)
    ids = (sub / "train_ids.txt").read_text().split()
    assert set(ids) == {f"t{i:02d}" for i in range(10)} - {"t01"}
    assert (sub / "download_train.txt").read_text().startswith("train/t00\n")
    assert info["excluded_rotated"] == 1 and not (sub / "validation_ids.txt").exists()
    # lấy mẫu theo hash: tái lập được, tỉ lệ 0 → không còn ứng viên
    assert oi_data.hash_fraction("abc") == oi_data.hash_fraction("abc")
    none = prepare.run_select(prepare.SelectParams(
        data_root=str(tmp_path), splits=["train"], mapping=str(mp), train_pool_fraction=0.0))
    assert none["splits"]["train"]["selected"] == 0


def test_resolve_reports_unknown_name(tmp_path):
    _write_annotations(tmp_path)
    mp = _mapping(tmp_path, [("Dogg", "object", "")])
    with pytest.raises(SystemExit, match="Dog"):
        oi_data.resolve_classes(tmp_path, mp)


# ── Chuỗi E2 → E4 → E5 → E6 với feature giả ───────────────────────────────
def _fake_subset(root, rng, n_val=120, n_test=160, n_train=300):
    classes = [
        {"oi_name": "Dog", "oi_mid": "/m/d", "group": "object", "coco": "dog", "old_tag": "pets",
         "prompt": "", "boxable": True, "descendants": [], "ancestors": []},
        {"oi_name": "Car", "oi_mid": "/m/car", "group": "object", "coco": "car", "old_tag": "vehicles",
         "prompt": "", "boxable": True, "descendants": [], "ancestors": []},
        {"oi_name": "Beach", "oi_mid": "/m/b", "group": "scene", "coco": "", "old_tag": "beach",
         "prompt": "", "boxable": False, "descendants": [], "ancestors": []},
    ]
    oi_data.save_classes(root, classes)
    sub = oi_data.subset_dir(root)
    data = {}
    for split, n in (("train", n_train), ("validation", n_val), ("test", n_test)):
        ids = [f"{split[0]}{k:04d}" for k in range(n)]
        Y = (rng.random((n, 3)) < 0.35).astype(np.int8)
        Y[rng.random((n, 3)) < 0.1] = -1
        boxes = {i: [[c, 0.1, 0.1, 0.6, 0.6, 0] for c in (0, 1) if Y[k, c] == 1] for k, i in enumerate(ids)}
        caps = {i: [" and ".join(n for c, n in enumerate(("a dog", "a car", "the beach")) if Y[k, c] == 1)
                    or "a photo"] for k, i in enumerate(ids)}
        np.savez_compressed(sub / f"{split}.npz", image_ids=np.array(ids), Y=Y,
                            sizes=np.full((n, 2), 100, np.int32),
                            mapping_hash=np.array(oi_data.mapping_hash(classes)))
        (sub / f"{split}_boxes.json").write_text(json.dumps(boxes))
        (sub / f"{split}_captions.json").write_text(json.dumps(caps))
        data[split] = (ids, Y)
    return data


@pytest.fixture()
def fake_models(tmp_path, monkeypatch):
    rng = np.random.default_rng(0)
    data = _fake_subset(tmp_path, rng)
    D = 16
    W = np.linalg.qr(rng.normal(size=(D, D)))[0][:4]  # 3 lớp + generic, trực giao

    X_all = {}
    for split, (all_ids, Y) in data.items():  # cố định: mọi lần gọi trả cùng feature
        X = np.clip(Y, 0, 1).astype(np.float32) @ W[:3] + 0.6 * rng.normal(size=(len(all_ids), D)) + W[3]
        X_all[split] = (X / np.linalg.norm(X, axis=1, keepdims=True)).astype(np.float32)

    def split_of(name):
        return next(sp for sp in ("train", "validation", "test") if name.endswith(sp))

    def feats(name, ids, *a, **k):
        split = split_of(name)
        pos = {i: j for j, i in enumerate(data[split][0])}
        return X_all[split][[pos[i] for i in ids]]

    R = np.linalg.qr(rng.normal(size=(D, D)))[0]  # "DINO" = phép quay khác của cùng thông tin + nhiễu riêng

    def dino(name, ids, *a, **k):
        X = feats(name, ids) @ R + 0.3 * np.random.default_rng(len(ids)).normal(size=(len(ids), D))
        return (X / np.linalg.norm(X, axis=1, keepdims=True)).astype(np.float32)

    def prompts(spec, words, templates, device="auto"):
        return W[:3] + 0.01 * len(templates[0]) * W[3]

    def texts(spec, items, device="auto", batch_size=256):
        out = []
        for t in items:
            v = sum(W[c] for c, w in enumerate(("dog", "car", "beach")) if w in t.lower()) + 0.1 * W[3]
            out.append(v / np.linalg.norm(v))
        return np.asarray(out, np.float32).reshape(len(items), D)

    def dets(name, ids, *a, **k):
        split = split_of(name)
        all_ids, Y = data[split]
        pos = {i: j for j, i in enumerate(all_ids)}
        out = {}
        for i in ids:
            y = Y[pos[i]]
            out[i] = [{"class_name": n, "confidence": float(0.5 + 0.4 * rng.random()) if y[c] == 1
                       else float(0.3 * rng.random()), "bbox": [0.1, 0.1, 0.6, 0.6]}
                      for c, n in enumerate(("dog", "car"))]
        return out

    import experiments.e2_clip_tag as e2
    import experiments.e3_search as e3
    import experiments.e4_yolo as e4
    import experiments.e6_hybrid as e6
    import experiments.probe as pr
    import experiments.yolo_ft as yf

    for mod in (e2, e3, e6):
        monkeypatch.setattr(mod, "clip_image_features", feats)
    monkeypatch.setattr(e2, "prompt_embeddings", prompts)
    monkeypatch.setattr(e2, "generic_embedding", lambda *a, **k: W[3])
    monkeypatch.setattr(e2, "logit_scale", lambda *a, **k: 100.0)
    monkeypatch.setattr(e3, "encode_texts", texts)
    monkeypatch.setattr(e6, "encode_texts", texts)
    monkeypatch.setattr(e4, "yolo_detections", dets)
    monkeypatch.setattr(e4, "yolo_names", lambda *a, **k: ["dog", "car"])
    monkeypatch.setattr(pr, "clip_image_features", feats)
    monkeypatch.setattr(pr, "dino_image_features", dino)
    monkeypatch.setattr(pr, "yolo_detections", dets)
    monkeypatch.setattr(pr, "yolo_names", lambda *a, **k: ["dog", "car"])
    monkeypatch.setattr(yf, "yolo_detections", dets)
    return tmp_path


def test_pipeline_e2_to_e6(fake_models):
    from experiments import e2_clip_tag, e3_search, e4_yolo, e5_fusion, e6_hybrid
    from experiments.core import result_root

    root = str(fake_models)
    s2 = e2_clip_tag.run(e2_clip_tag.E2Params(data_root=root, bootstrap=20, calib_min_count=5))
    assert s2["test"]["mAP"] > 0.5
    s3 = e3_search.run(e3_search.E3Params(data_root=root, parts=["a", "b"]))
    assert s3["a_class_queries"]["strict_all"]["AP"] > 0.3 and s3["b_captions"]["full"]["R@10"] > 0
    s4 = e4_yolo.run(e4_yolo.E4Params(data_root=root, bootstrap=20))
    assert s4["covered_classes"] == 2 and s4["test_detection_mAP50"] > 0.5
    # bản "fine-tune": run E4 biến thể không ghi latest → E5 / probe / E6 nhận qua run id
    e4_latest = json.loads((result_root(fake_models) / "e4" / "latest.json").read_text())["run_id"]
    e4_ft = e4_yolo.run(e4_yolo.E4Params(data_root=root, bootstrap=0, latest=False))
    assert e4_ft["covered_classes"] == 2
    assert json.loads((result_root(fake_models) / "e4" / "latest.json").read_text())["run_id"] == e4_latest
    ft_id = next(d.name for d in (result_root(fake_models) / "e4").iterdir() if d.is_dir() and d.name != e4_latest)
    s5 = e5_fusion.run(e5_fusion.E5Params(data_root=root, bootstrap=20, calib_min_count=5, e4_ft_run=ft_id))
    assert set(s5["test_all_classes"]) >= {"per_tag", "clip_only", "yolo_only", "group_baseline",
                                           "per_tag_ft", "yolo_only_ft"}
    assert "per_tag_ft_minus_per_tag_mAP_lo" in s5["paired_ci95"] and s5["e4_ft_run"] == ft_id
    from experiments import probe

    sp = probe.run(probe.ProbeParams(data_root=root, bootstrap=20, l2=[1e-3, 1e-2], unknown_weight=[0.0, 1.0],
                                     calib_min_count=5))
    probe_latest = json.loads((result_root(fake_models) / "probe" / "latest.json").read_text())["run_id"]
    probe.run(probe.ProbeParams(data_root=root, bootstrap=0, l2=[1e-3], unknown_weight=[0.0], calib_min_count=5,
                                configs=["fused_learned"], latest=False))
    probe_ft = next(d.name for d in (result_root(fake_models) / "probe").iterdir()
                    if d.is_dir() and d.name != probe_latest)
    h = sp["test_all_classes"]
    assert set(h) == {"zs_clip", "e5_per_tag", *probe.CONFIGS}
    assert h["lp_clip"]["mAP"] > 0.5 and "lp_clip_minus_zs_clip_mAP_lo" in sp["paired_ci95"]
    s6 = e6_hybrid.run(e6_hybrid.E6Params(data_root=root, query_sets=["captions"], bootstrap=20,
                                          probe_ft_run=probe_ft))
    # clip + 3 chế độ (filter, boost, boost_prob) × 11 nguồn (yolo, clip, fused, yolo_ft, fused_ft, 4 probe,
    # fused_learned_ft, oracle)
    assert len(s6["captions"]["rows"]) == 1 + 3 * 11 and s6["probe_run"] and s6["probe_ft_run"] == probe_ft
    rows = {(r["mode"], r["source"]): r for r in s6["captions"]["rows"]}
    assert rows[("boost", "oracle")]["ceiling"] and not rows[("boost", "yolo")]["ceiling"]
    assert rows[("boost", "oracle")]["MRR"] >= rows[("clip", "-")]["MRR"] - 1e-9  # tag hoàn hảo không làm tệ hơn
    assert 0 < s6["oracle_named_pairs"]["positive"] <= 1
    pw = {(r["a"], r["b"]): r for r in s6["captions"]["pairwise"]}
    assert len(pw) == len(e6_hybrid.DEFAULT_COMPARE) and all("diff_ci_lo" in r for r in pw.values())
    for exp in ("e2", "e3", "e4", "e5", "probe", "e6"):
        latest = json.loads((result_root(fake_models) / exp / "latest.json").read_text())
        status = json.loads((result_root(fake_models) / exp / latest["run_id"] / "status.json").read_text())
        assert status["state"] == "done"
        # History: mỗi run chính thức → 1 version + 1 dòng index.csv
        hist = fake_models / "History" / exp
        assert any(d.name.startswith("v001_") for d in hist.iterdir())
        index = list(csv.DictReader(open(hist / "index.csv")))
        assert index[0]["version"] == "v001" and index[0]["data_fingerprint"].startswith("map=")
    from experiments import report

    text = report.build_report(report.ReportParams(data_root=root)).read_text()
    assert "## E5" in text and "chọn theo từng tag" in text and "chưa chạy" in text  # e1 chưa chạy
    en = report.build_report(report.ReportParams(data_root=root, lang="en")).read_text()
    assert "per-tag rule" in en and "not run" in en and "chọn" not in en
    # SUMMARY tự cập nhật sau mỗi run → mỗi run đổi metric = 1 version
    summary_md = (fake_models / "Results" / "oi" / "SUMMARY.md").read_text()
    assert "## E5" in summary_md and "Nghĩa là" in summary_md and "Lịch sử version" in summary_md
    assert "Trần (tag hoàn hảo" in summary_md and "oracle (trần)" in text
    from experiments.summary import key_metrics  # oracle không được tính là "boost tốt nhất"

    km = key_metrics({"e6": s6})
    assert km["E6 MRR boost tốt nhất"] == pytest.approx(max(
        r["MRR"] for r in s6["captions"]["rows"] if r["mode"].startswith("boost") and r["source"] != "oracle"), abs=1e-4)
    versions = list(csv.DictReader(open(fake_models / "History" / "summary" / "index.csv")))
    assert len(versions) == 6 and versions[-1]["trigger"].startswith("e6/")
    assert "## Probe" in summary_md and "## Probe" in text
    from experiments import summary

    summary.update_summary(fake_models)  # metric không đổi → không thêm version
    assert len(list(csv.DictReader(open(fake_models / "History" / "summary" / "index.csv")))) == 6
    e2_index = list(csv.DictReader(open(fake_models / "History" / "e2" / "index.csv")))
    assert float(e2_index[0]["test.mAP"]) == pytest.approx(s2["test"]["mAP"], abs=1e-4)


def test_e6_oracle_only_without_e5(fake_models):
    """Chỉ nguồn oracle → không cần run E5 (đo trần trước khi train gì)."""
    from experiments import e6_hybrid

    s6 = e6_hybrid.run(e6_hybrid.E6Params(data_root=str(fake_models), query_sets=["captions"],
                                          sources=["oracle"], bootstrap=20))
    assert "e5_run" not in s6 and [(r["mode"], r["source"]) for r in s6["captions"]["rows"]] == [
        ("clip", "-"), ("filter", "oracle"), ("boost", "oracle"), ("boost_prob", "oracle")]


def test_e6_pairwise_rows():
    from experiments.e6_hybrid import pairwise_rows

    vals = {("boost", "a"): np.array([1.0, 1.0, 0.5, np.nan]), ("clip", None): np.array([0.5, 0.5, 0.5, 0.2])}
    rows = pairwise_rows(vals, ["boost:a,clip", "boost:missing,clip"], 50, "P@10")
    assert len(rows) == 1 and rows[0]["queries"] == 3 and rows[0]["diff"] == pytest.approx(1 / 3)
    assert rows[0]["diff_ci_lo"] >= 0


def test_e6_scores_filter_and_boost():
    from experiments.e6_hybrid import FILTER_PENALTY, extra_scores

    N = np.array([[1, 1, 0], [0, 0, 0]], np.float32)
    D = np.array([[1, 1, 0], [1, 0, 0]], np.uint8)
    f = extra_scores("filter", N, D)
    assert f[0].tolist() == [0, FILTER_PENALTY] and f[1].tolist() == [0, 0]
    b = extra_scores("boost", N, D, 0.2)
    assert b[0].tolist() == pytest.approx([0.2, 0.1]) and b[1].tolist() == [0, 0]


def test_e3c_judging_pool_roundtrip(fake_models):
    from experiments import e3_search, judging

    params = e3_search.E3Params(data_root=str(fake_models), parts=["c"], c_configs=["en@app"], top_k=5)
    first = e3_search.run(params)["c_compositional"]
    assert first["unjudged_pairs"] > 0 and first["en@app"]["judged_fraction"] == 0
    path = judging.pool_path(fake_models)
    rows = list(csv.DictReader(open(path)))
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=judging.FIELDS)
        w.writeheader()
        w.writerows({**r, "relevant": "1"} for r in rows)
    second = e3_search.run(params)["c_compositional"]
    assert second["unjudged_pairs"] == 0
    assert second["en@app"]["judged_fraction"] == 1 and second["en@app"]["P@10"] == pytest.approx(1.0)


def test_queries_reference_mapped_classes():
    """queries.csv (cột classes) chỉ được dùng tên lớp có trong oi_classes.csv."""
    from experiments import judging

    names = {r["oi_name"] for r in oi_data.read_mapping()}
    bad = [(q["id"], c) for q in judging.read_queries() for c in q["classes"].split(";") if c and c not in names]
    assert not bad


def test_judge_server_roundtrip(tmp_path):
    """Trang chấm: lưu 1 cặp, 'còn lại = sai', payload query."""
    from experiments import judge_server, judging

    a, b = "0123456789abcdef", "fedcba9876543210"
    judging.add_to_pool(tmp_path, [("q001", a), ("q001", b), ("q002", a)])
    assert judge_server.set_judgment(tmp_path, "q001", a, "1")
    assert not judge_server.set_judgment(tmp_path, "q009", a, "1")  # cặp không có trong pool
    assert judge_server.fill_rest(tmp_path, "q001") == 1
    pool = judging.read_pool(tmp_path)
    assert pool[("q001", a)] == "1" and pool[("q001", b)] == "0" and pool[("q002", a)] == ""
    q1 = next(q for q in judge_server.queries_payload(tmp_path) if q["id"] == "q001")
    assert {i["id"]: i["v"] for i in q1["images"]} == {a: "1", b: "0"}


# ── YOLO fine-tune (không train thật: test xuất dataset + đánh giá với detection giả) ──
def test_yolo_label_lines():
    from experiments.yolo_ft import yolo_label_lines

    lines = yolo_label_lines([[3, 0.1, 0.2, 0.5, 0.6, 0], [7, 0.0, 0.0, 1.0, 1.0, 1], [3, 0.4, 0.4, 0.4, 0.9, 0]],
                             {3: 0})
    assert lines == ["0 0.300000 0.400000 0.400000 0.400000"]  # lớp 7 không train, box suy biến bị bỏ


def test_yolo_ft_export_and_eval_only(fake_models, monkeypatch):
    from experiments import yolo_ft
    from experiments.oi_data import load_subset

    root = str(fake_models)
    subsets = {s: load_subset(fake_models, s) for s in ("train", "validation", "test")}
    obj = yolo_ft.object_classes(subsets["train"].classes)
    assert [subsets["train"].classes[j]["oi_name"] for j in obj] == ["Dog", "Car"]
    yaml, stats = yolo_ft.export_dataset(fake_models / "yolo", subsets, obj)
    assert "names:" in yaml.read_text() and stats["train"]["images"] > 0
    some = next((fake_models / "yolo" / "labels" / "train").glob("*.txt"))
    assert some.read_text().split()[0] in ("0", "1")
    assert (fake_models / "yolo" / "images" / "train" / f"{some.stem}.jpg").is_symlink()

    base_dets = yolo_ft.yolo_detections  # = dets giả của fixture (tên COCO)

    def dets(name, ids, paths, data_root, weights, *a, **k):
        out = base_dets(name, ids)
        if weights == "yolo26n.pt":
            return out
        rename = {"dog": "Dog", "car": "Car"}  # model fine-tune trả tên lớp Open Images
        return {i: [{**d, "class_name": rename[d["class_name"]]} for d in v] for i, v in out.items()}

    monkeypatch.setattr(yolo_ft, "yolo_detections", dets)
    s = yolo_ft.run(yolo_ft.YoloFTParams(data_root=root, eval_only=True, weights="fake-oi.pt", latency_images=0,
                                         bootstrap=20))
    tags = {(t["model"], t["set"]): t for t in s["tag"]}
    assert tags[("ft", "coco")]["mAP"] == pytest.approx(tags[("base", "coco")]["mAP"])  # cùng detection → bằng nhau
    assert s["oi_detection_AP50"]["ft_coco"] == pytest.approx(s["oi_detection_AP50"]["base_coco"])
    assert "ft_minus_base_coco_mAP_lo" in s["paired_ci95"] and s["weights"] == "fake-oi.pt"
    summary_md = (fake_models / "Results" / "oi" / "SUMMARY.md").read_text()
    report_md = (fake_models / "Results" / "oi" / "REPORT.md").read_text()
    assert "## YOLO-FT" in summary_md and "lớp COCO gốc" in summary_md and "## YOLO-FT" in report_md


def test_yolo_ft_pseudo_labels(fake_models, monkeypatch):
    """--pseudo-label: box giả chỉ ở lớp chưa xác minh của train, val/test không đổi."""
    from experiments import yolo_ft
    from experiments.oi_data import load_subset

    fixture_dets = yolo_ft.yolo_detections

    def dets(name, ids, *a, **k):  # train: YOLO gốc thấy cả chó lẫn xe, chỗ khác box người
        if name != "oi-train":
            return fixture_dets(name, ids)
        return {i: [{"class_name": n, "confidence": 0.99, "bbox": [0.7, 0.7, 0.95, 0.95]} for n in ("dog", "car")]
                for i in ids}

    monkeypatch.setattr(yolo_ft, "yolo_detections", dets)

    class FakeRun:
        tables = {}

        def stage(self, *a): ...
        def log(self, *a): ...
        def progress(self, *a): ...
        def table(self, name, rows):
            self.tables[name] = rows

    subsets = {s: load_subset(fake_models, s) for s in ("train", "validation", "test")}
    train = subsets["train"]
    train.Y[:, :] = np.where(train.Y == 1, 1, -1)  # mọi negative → chưa xác minh: chỗ cần box giả
    obj = yolo_ft.object_classes(train.classes)
    p = yolo_ft.YoloFTParams(data_root=str(fake_models), pseudo_label=True, pseudo_min_tp=1, pseudo_precision=0.5)
    run = FakeRun()
    merged, summary = yolo_ft.make_pseudo_labels(p, run, subsets, obj)
    assert summary["classes_reached"] >= 1 and summary["pseudo_boxes"] > 0
    assert {r["class"] for r in run.tables["pseudo_labels"]} == {"Dog", "Car"}
    for img, boxes in merged.boxes.items():
        i = train.image_ids.index(img)
        extra = boxes[len(train.boxes.get(img, [])):]
        assert all(train.Y[i, int(b[0])] == -1 for b in extra)  # không đè lớp đã xác minh


def test_export_tags_calibrator_roundtrip():
    """Calibrator đóng gói bởi export_tags cho đúng xác suất như experiments.metrics."""
    from app.tagging.labels import calibrate
    from experiments import metrics as M
    from experiments.export_tags import open_world, pack_calibrators

    rng = np.random.default_rng(0)
    S = rng.normal(size=(400, 3)).astype(np.float32)
    Y = (S + rng.normal(scale=0.5, size=S.shape) > 0.5).astype(np.int8)
    Y[:385, 2] = -1  # lớp 2 ít mẫu → isotonic chung
    Yo = open_world(Y)
    assert Yo.min() == 0 and set(np.unique(Yo)) <= {0, 1}
    cals = M.fit_calibrators(S, Y, np.zeros(3), 10)
    np.testing.assert_allclose(calibrate(S, pack_calibrators(cals, 3)), M.apply_calibrators(S, cals), atol=1e-5)
