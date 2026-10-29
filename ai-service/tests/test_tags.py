import math

from bench.cls_taxonomy import TAG_IDS


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
