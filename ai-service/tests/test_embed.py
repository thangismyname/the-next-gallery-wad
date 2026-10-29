import math


def test_embed_text_returns_unit_512_vector(client):
    res = client.post("/api/v1/embed/text", json={"text": "a dog running"})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "stub"
    assert body["dimension"] == 512
    emb = body["embedding"]
    assert len(emb) == 512
    # Unit-norm (stub L2-normalize) — pgvector cosine cần vector chuẩn hoá.
    norm = math.sqrt(sum(v * v for v in emb))
    assert abs(norm - 1.0) < 1e-6


def test_embed_text_deterministic(client):
    r1 = client.post("/api/v1/embed/text", json={"text": "hello"})
    r2 = client.post("/api/v1/embed/text", json={"text": "hello"})
    assert r1.json()["embedding"] == r2.json()["embedding"]


def test_embed_image_ok(client, png_upload):
    res = client.post("/api/v1/embed/image", files=png_upload)
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "stub"
    assert len(body["embedding"]) == 512


def test_classify_probabilities_sum_to_one(client, png_upload):
    res = client.post(
        "/api/v1/classify",
        files=png_upload,
        data={"labels": '["dog","car","cat"]'},
    )
    assert res.status_code == 200
    preds = res.json()["predictions"]
    assert len(preds) == 3
    assert abs(sum(p["probability"] for p in preds) - 1.0) < 1e-5
    # Sorted giảm dần theo probability.
    probs = [p["probability"] for p in preds]
    assert probs == sorted(probs, reverse=True)


def test_classify_requires_min_two_labels(client, png_upload):
    res = client.post(
        "/api/v1/classify",
        files=png_upload,
        data={"labels": '["dog"]'},
    )
    assert res.status_code == 400


def test_embed_info(client):
    res = client.get("/api/v1/embed/info")
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "stub"
    assert body["dimension"] == 512


def test_reject_wrong_content_type(client):
    res = client.post(
        "/api/v1/embed/image",
        files={"file": ("note.txt", b"not an image", "text/plain")},
    )
    assert res.status_code == 400


def test_reject_empty_file(client):
    res = client.post(
        "/api/v1/embed/image",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert res.status_code == 400
