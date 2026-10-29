"""Kiểm tra metric + reader của bench/ trên dữ liệu giả (không cần model/dataset)."""
import io
import tarfile

import numpy as np

from app.providers.embed_stub import StubEmbeddingProvider
from bench.clip_data import load_classification, load_retrieval
from bench.clip_eval import (
    backend_preprocess,
    prompt_templates,
    retrieval_recalls,
    topk_accuracy,
    zeroshot_classifier,
)


def _unit(rows):
    rows = np.asarray(rows, dtype=np.float32)
    return rows / np.linalg.norm(rows, axis=1, keepdims=True)


def test_retrieval_recalls_perfect_and_partial():
    images = _unit(np.eye(3, 4))
    # 2 caption / ảnh; caption trùng hướng ảnh của nó → mọi recall = 100
    texts = _unit(np.repeat(np.eye(3, 4), 2, axis=0))
    owner = np.array([0, 0, 1, 1, 2, 2])
    result = retrieval_recalls(images, texts, owner)
    assert result["t2i_R@1"] == 100.0 and result["i2t_R@1"] == 100.0

    # caption cuối trỏ sai sang ảnh 0 → t2i R@1 = 5/6
    texts_wrong = texts.copy()
    texts_wrong[5] = images[0]
    result = retrieval_recalls(images, texts_wrong, owner)
    assert result["t2i_R@1"] == round(100 * 5 / 6, 2)
    assert result["i2t_R@1"] == 100.0  # ảnh 2 vẫn còn caption 4 đúng
    assert result["t2i_R@5"] == 100.0  # chỉ 3 ảnh → top-5 chứa hết


def test_topk_accuracy():
    classifier = _unit(np.eye(3))
    images = _unit([[1, 0.1, 0], [0, 1, 0.2], [1, 0, 0.1]])
    labels = np.array([0, 1, 2])  # ảnh cuối bị đoán lớp 0
    acc = topk_accuracy(images, classifier, labels)
    assert acc["top1"] == round(100 * 2 / 3, 2)
    assert acc["top5"] == 100.0


def test_prompt_modes():
    templates = ["a photo of a {c}.", "a drawing of a {c}."]
    assert prompt_templates("ensemble", templates) == templates
    assert prompt_templates("single", templates) == ["a photo of a {c}."]
    assert prompt_templates("classname", templates) == ["{c}"]


def test_zeroshot_classifier_unit_rows():
    weights = zeroshot_classifier(StubEmbeddingProvider(), ["dog", "cat"], ["a photo of a {c}.", "{c}"], 8)
    assert weights.shape == (2, 512)
    np.testing.assert_allclose(np.linalg.norm(weights, axis=1), 1.0, atol=1e-5)


def _add(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def test_wds_readers(tmp_path, tiny_png):
    root = tmp_path / "clip_benchmark"
    coco = root / "mscoco_captions" / "test"
    coco.mkdir(parents=True)
    with tarfile.open(coco / "0.tar", "w") as tar:
        _add(tar, "s0000000.jpg", tiny_png)
        _add(tar, "s0000000.txt", b"a red square\nsomething red\n")
        _add(tar, "s0000001.jpg", tiny_png)
        _add(tar, "s0000001.txt", b"another one\n")
    data = load_retrieval(tmp_path, "mscoco_captions")
    assert len(data.images) == 2
    assert data.captions == ["a red square", "something red", "another one"]
    assert data.caption_to_image == [0, 0, 1]
    assert len(load_retrieval(tmp_path, "mscoco_captions", limit=1).images) == 1

    cifar = root / "cifar10"
    (cifar / "test").mkdir(parents=True)
    (cifar / "classnames.txt").write_text("airplane\nautomobile\n")
    (cifar / "zeroshot_classification_templates.txt").write_text("a photo of a {c}.\n")
    with tarfile.open(cifar / "test" / "0.tar", "w") as tar:
        _add(tar, "s0000000.cls", b"1")
        _add(tar, "s0000000.webp", tiny_png)
    data = load_classification(tmp_path, "cifar10")
    assert data.labels == [1] and data.classnames == ["airplane", "automobile"]
    assert data.templates == ["a photo of a {c}."]


def test_backend_preprocess_resizes_to_webp():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (1600, 900), (10, 20, 30)).save(buffer, format="JPEG")
    out = Image.open(io.BytesIO(backend_preprocess(buffer.getvalue())))
    assert out.format == "WEBP"
    assert max(out.size) == 512 and out.size == (512, 288)


def test_report_renders(tmp_path, monkeypatch):
    import bench.report as report
    from bench.common import append_csv

    monkeypatch.setattr(report, "RESULTS_DIR", tmp_path)
    for mode, ap in (("e2e", 38.3), ("nms", 39.4)):
        append_csv(tmp_path / "yolo_coco_val2017.csv", {
            "timestamp": "2026-01-01T00:00:00Z", "model": "yolov10n", "mode": mode, "device": "mps",
            "images": 5000, "ultra_map50_95": ap - 0.5, "coco_map50_95": ap,
            "published_map50_95": 38.5 if mode == "e2e" else 39.5,
            "delta_vs_published": round(ap - (38.5 if mode == "e2e" else 39.5), 2),
        })
        append_csv(tmp_path / "yolo_latency.csv", {
            "timestamp": "2026-01-01T00:00:00Z", "model": "yolov10n", "mode": mode, "device": "mps",
            "model_mean_ms": 10.0 if mode == "e2e" else 15.0, "model_p95_ms": 12.0,
            "published_latency_ms": 1.84,
        })
    monkeypatch.setattr("sys.argv", ["report", "--out", str(tmp_path / "R.md")])
    assert report.main() == 0
    text = (tmp_path / "R.md").read_text()
    assert "Tái lập YOLOv10" in text and "38.3" in text and "-0.2" in text
    assert "1.50×" in text  # NMS 15 ms / e2e 10 ms
    monkeypatch.setattr("sys.argv", ["report", "--format", "latex", "--out", str(tmp_path / "R.tex")])
    assert report.main() == 0
    assert "\\begin{tabular}" in (tmp_path / "R.tex").read_text()
