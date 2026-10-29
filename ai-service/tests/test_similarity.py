import math


def test_similarity_embed_returns_unit_384_vector(client, png_upload):
    res = client.post("/api/v1/similarity/embed", files=png_upload)
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "stub"
    assert body["dimension"] == 384
    emb = body["embedding"]
    assert len(emb) == 384
    norm = math.sqrt(sum(v * v for v in emb))
    assert abs(norm - 1.0) < 1e-6


def test_similarity_embed_rejects_non_image(client):
    res = client.post(
        "/api/v1/similarity/embed",
        files={"file": ("a.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 400


def test_similarity_info(client):
    res = client.get("/api/v1/similarity/info")
    assert res.status_code == 200
    assert res.json() == {"provider": "stub", "model": "stub", "dimension": 384}
