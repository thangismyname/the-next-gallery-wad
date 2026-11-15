import csv
import json
import math
from pathlib import Path

import numpy as np
import pytest

from app.providers.embed_stub import StubEmbeddingProvider
from app.tagging import Tagger
from app.tagging.labels import (
    LABEL_PREFIX,
    SECTIONS,
    calibrate,
    label_catalog,
    load_label_probe,
)
from app.tagging.taxonomy import TAG_IDS

SERVICE_ROOT = Path(__file__).resolve().parent.parent


def _unit(dim: int, seed: int) -> list[float]:
    values = [math.sin(seed * 31 + i) for i in range(dim)]
    norm = math.sqrt(sum(v * v for v in values))
    return [v / norm for v in values]


def test_tags_info_lists_taxonomy(client):
    res = client.get("/api/v1/tags/info")
    assert res.status_code == 200
    body = res.json()
    assert [t["id"] for t in body["tags"]] == TAG_IDS
    assert body["dimension"] == 512
    assert all(0 <= t["threshold"] <= 1 for t in body["tags"])


def test_tags_predict_scores_every_tag(client):
    res = client.post(
        "/api/v1/tags/predict", json={"embeddings": [_unit(512, 1), _unit(512, 2)]}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["tags"] == TAG_IDS
    assert len(body["thresholds"]) == len(TAG_IDS)
    assert len(body["scores"]) == 2
    for row in body["scores"]:
        assert len(row) == len(TAG_IDS)
        assert all(0 <= p <= 1 for p in row)


def test_tags_predict_rejects_wrong_dimension(client):
    res = client.post("/api/v1/tags/predict", json={"embeddings": [[0.1, 0.2]]})
    assert res.status_code == 400


def test_tags_model_names_clip(client):
    # Tên model gắn tag ghi kèm CLIP → backend biết tag cũ lỗi thời khi đổi CLIP.
    assert client.get("/api/v1/tags/info").json()["model"].startswith("stub: ")


def test_embed_info_has_logit_scale(client):
    assert client.get("/api/v1/embed/info").json()["logit_scale"] > 0


# ── Nhãn chi tiết (Open Images, 174 lớp) ──────────────────────────────────
def _fake_label_probe(path, clip_model: str, dim: int, classes: list[str]) -> None:
    rng = np.random.default_rng(0)
    C = len(classes)
    mode = np.zeros(C, np.int8)
    mode[0], mode[1] = 1, 2  # lớp 0: isotonic riêng, lớp 1: isotonic chung, còn lại: sigmoid
    np.savez(
        path, meta=json.dumps({"kind": "oi_probe", "classes": classes, "clip_model": clip_model}),
        W=rng.normal(size=(dim, C)).astype(np.float32), b=np.zeros(C, np.float32),
        mean=np.zeros(dim, np.float32), std=np.ones(dim, np.float32),
        thresholds=np.full(C, 0.6, np.float32), cal_mode=mode, cal_shift=np.zeros(C, np.float32),
        cal_x=np.array([-1.0, 1.0], np.float32), cal_y=np.array([0.1, 0.9], np.float32),
        cal_ptr=np.array([0, 2] + [2] * (C - 1), np.int64),
        global_x=np.array([-2.0, 2.0], np.float32), global_y=np.array([0.0, 1.0], np.float32),
    )


def test_label_catalog_is_consistent():
    rows = label_catalog()
    assert len(rows) == 174
    assert len({r["id"] for r in rows}) == 174
    assert {r["section"] for r in rows} == set(SECTIONS)
    assert all(r["en"] and r["vi"] and r["ja"] for r in rows)


def test_label_catalog_matches_experiment_classes():
    path = SERVICE_ROOT / "experiments" / "data" / "oi_classes.csv"
    with path.open(encoding="utf-8") as f:
        oi = [r["oi_name"] for r in csv.DictReader(line for line in f if not line.startswith("#"))]
    assert [r["oi_name"] for r in label_catalog()] == oi


def test_calibrate_modes():
    arrays = {
        "cal_mode": np.array([1, 2, 0], np.int8), "cal_shift": np.array([0, 1, 0], np.float32),
        "cal_ptr": np.array([0, 2, 2, 2]), "cal_x": np.array([0.0, 1.0]), "cal_y": np.array([0.2, 0.8]),
        "global_x": np.array([-1.0, 1.0]), "global_y": np.array([0.0, 1.0]),
    }
    P = calibrate(np.array([[0.5, 1.0, 0.0]], np.float32), arrays)
    assert P[0] == pytest.approx([0.5, 0.5, 0.5])


def test_tagger_loads_label_probe(tmp_path):
    provider = StubEmbeddingProvider()
    classes = [r["oi_name"] for r in label_catalog()]
    _fake_label_probe(tmp_path / "oi-lp_clip.npz", provider.model, provider.dimension, classes)
    tagger = Tagger(provider, str(tmp_path), "lp_clip")

    assert tagger.labels is not None
    assert tagger.model.endswith("oi-lp_clip")  # đổi probe → backend gắn tag lại
    assert tagger.label_ids[0] == LABEL_PREFIX + label_catalog()[0]["id"]
    X = np.asarray([provider.encode_image(b"a"), provider.encode_image(b"b")], np.float32)
    L = tagger.predict_labels(X)
    assert L.shape == (2, 174) and ((L >= 0) & (L <= 1)).all()
    info = tagger.info()
    assert len(info["labels"]) == 174 and info["sections"] == list(SECTIONS)
    assert tagger.mode["labels"] == "oi-lp_clip"


def test_tagger_skips_label_probe_of_other_clip(tmp_path):
    provider = StubEmbeddingProvider()
    classes = [r["oi_name"] for r in label_catalog()]
    _fake_label_probe(tmp_path / "oi-lp_clip.npz", "ViT-L-14", provider.dimension, classes)
    tagger = Tagger(provider, str(tmp_path), "lp_clip")
    assert tagger.labels is None and tagger.label_ids == []
    assert tagger.predict_labels(np.zeros((1, provider.dimension), np.float32)) is None


def test_tags_predict_returns_labels_when_probe_loaded(client, tmp_path):
    provider = client.app.state.embed_provider
    classes = [r["oi_name"] for r in label_catalog()]
    _fake_label_probe(tmp_path / "oi-lp_clip.npz", provider.model, provider.dimension, classes)
    client.app.state.tagger = Tagger(provider, str(tmp_path), "lp_clip")
    body = client.post("/api/v1/tags/predict", json={"embeddings": [_unit(512, 3)]}).json()
    assert len(body["labels"]) == 174 and body["labels"][0].startswith(LABEL_PREFIX)
    assert len(body["label_thresholds"]) == 174
    assert len(body["label_scores"]) == 1 and len(body["label_scores"][0]) == 174
    health = client.get("/health").json()
    assert health["tagger"]["labels"] == "oi-lp_clip" and health["tagger"]["label_count"] == 174


def test_shipped_probes_load_for_default_clip():
    """Model .npz commit trong app/tagging/probes khớp CLIP mặc định của app."""
    directory = SERVICE_ROOT / "app" / "tagging" / "probes"
    probe = load_label_probe(directory, "lp_clip", "ViT-B-32")
    assert probe is not None and probe.meta.get("protocol") == "open_world"
    assert len(probe.thresholds) == 174


def test_search_lexicon_labels_in_sync():
    """Mục `labels` của từ điển search (backend) sinh từ labels.csv — sửa CSV thì
    chạy lại scripts/sync_search_lexicon.py."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("sync", SERVICE_ROOT / "scripts" / "sync_search_lexicon.py")
    sync = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync)
    lexicon = json.loads(sync.LEXICON_FILE.read_text(encoding="utf-8"))
    assert lexicon["labels"] == sync.build_labels(lexicon)
