"""Metric revisitop + encoder DINO của bench/ trên dữ liệu giả (không cần dataset/weights)."""
import pickle

import numpy as np
import pytest
from PIL import Image

from bench.dino_retrieval import HFEncoder, encode, paper_size
from bench.revisitop import average_precision, evaluate, load_revisitop


def test_average_precision_perfect_and_interleaved():
    assert average_precision(np.array([0, 1]), 2) == pytest.approx(1.0)
    # positive ở hạng 0 và 2: (1+1)/2·½ + (½+⅔)/2·½
    assert average_precision(np.array([0, 2]), 2) == pytest.approx(0.5 + (0.5 + 2 / 3) / 4)
    # 1 positive không được tìm thấy → AP chỉ tính phần đã thấy
    assert average_precision(np.array([0]), 2) == pytest.approx(0.5)


def test_evaluate_protocols_and_junk():
    # 1 query, database 4 ảnh. Thứ hạng theo similarity: 3, 2, 1, 0.
    similarity = np.array([[0.1, 0.2, 0.3, 0.4]])
    gnd = [{"easy": [1], "hard": [0], "junk": [3]}]
    result = evaluate(similarity, gnd)
    # Easy: ok={1}, junk={3,0} → ranking sạch [2, 1] → hạng 1 → AP = (0 + ½)/2
    assert result["mAP_E"] == pytest.approx(25.0)
    # Medium: ok={1,0}, junk={3} → [2, 1, 0] → hạng 1, 2 → (0 + ½)/4 + (½ + ⅔)/4
    assert result["mAP_M"] == pytest.approx(100 * (0.5 / 4 + (0.5 + 2 / 3) / 4), abs=0.01)
    # Hard: ok={0}, junk={3,1} → [2, 0] → hạng 1 → (0 + ½)/2
    assert result["mAP_H"] == pytest.approx(25.0)
    assert result["mP@1_H"] == 0.0


def test_evaluate_skips_query_without_positives():
    similarity = np.array([[1.0, 0.0], [0.0, 1.0]])
    gnd = [{"easy": [0], "hard": [], "junk": []}, {"easy": [], "hard": [1], "junk": []}]
    result = evaluate(similarity, gnd)
    assert result["mAP_E"] == 100.0 and result["mAP_H"] == 100.0


def test_paper_size_keeps_aspect_and_patch_multiple():
    assert paper_size(1024, 768, 16) == (224, 160)  # 168 → bội 16 gần nhất
    assert paper_size(768, 1024, 14) == (168, 224)
    assert paper_size(4000, 10, 16) == (224, 16)  # tối thiểu 1 patch


@pytest.fixture()
def tiny_dino(tmp_path):
    from transformers import AutoModel, DINOv3ViTConfig, DINOv3ViTImageProcessor

    out = tmp_path / "tiny-dinov3"
    config = DINOv3ViTConfig(
        hidden_size=32, num_hidden_layers=1, num_attention_heads=2,
        intermediate_size=64, num_register_tokens=4, patch_size=16,
    )
    AutoModel.from_config(config).save_pretrained(out)
    DINOv3ViTImageProcessor(size={"height": 224, "width": 224}).save_pretrained(out)
    return HFEncoder("tiny", {"repo": str(out), "patch": 16}, "cpu")


def test_encoder_end_to_end_on_fake_revisitop(tmp_path, tiny_dino):
    root = tmp_path / "revisitop" / "roxford5k"
    (root / "jpg").mkdir(parents=True)
    names = ["a", "b", "c"]
    for i, (name, size) in enumerate(zip(names, [(320, 240), (240, 320), (300, 300)])):
        Image.new("RGB", size, (60 * i, 100, 200)).save(root / "jpg" / f"{name}.jpg")
    gnd = [{"bbx": [10, 10, 200, 150], "easy": [0], "hard": [1], "junk": []}]
    with open(root / "gnd_roxford5k.pkl", "wb") as fh:
        pickle.dump({"imlist": names, "qimlist": ["a"], "gnd": gnd}, fh)

    data = load_revisitop(tmp_path, "roxford5k")
    db_items = [(data.image_path(n), None) for n in data.imlist]
    for preprocess in ("pad224", "long224", "square224", "app"):
        db, _ = encode(tiny_dino, db_items, preprocess, batch_size=2, workers=2)
        assert db.shape == (3, 32)
        assert np.allclose(np.linalg.norm(db, axis=1), 1.0, atol=1e-5)
    queries, _ = encode(tiny_dino, [(data.image_path("a"), gnd[0]["bbx"])], "long224", 2, 1)
    result = evaluate(queries @ db.T, data.gnd)
    assert set(result) >= {"mAP_E", "mAP_M", "mAP_H", "mP@10_H"}


def test_letterbox_keeps_aspect_and_pads_black():
    from bench.dino_retrieval import letterbox

    out = letterbox(Image.new("RGB", (400, 200), (255, 255, 255)))
    assert out.size == (224, 224)
    assert out.getpixel((112, 10)) == (0, 0, 0)  # viền trên (ảnh chỉ cao 112)
    assert out.getpixel((112, 112)) == (255, 255, 255)
