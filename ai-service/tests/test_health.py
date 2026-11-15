def test_health_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["embed_provider"] == "stub"
    assert body["object_provider"] == "stub"
    assert "clip_model" in body


def test_root_service_info(client):
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body["service"] == "ai-service"
    assert "version" in body


def test_health_reports_tagger_mode(client):
    tagger = client.get("/health").json()["tagger"]
    # stub CLIP → không probe nào khớp → zero-shot, không có nhãn chi tiết
    assert tagger["categories"]["coco"] == "zero-shot"
    assert tagger["labels"] is None and tagger["label_count"] == 0
