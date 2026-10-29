def test_detect_objects_stub_returns_empty(client, png_upload):
    res = client.post("/api/v1/detect/objects", files=png_upload)
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "stub"
    assert body["model"] == "stub"
    assert body["detections"] == []


def test_detect_objects_reject_wrong_type(client):
    res = client.post(
        "/api/v1/detect/objects",
        files={"file": ("note.txt", b"nope", "text/plain")},
    )
    assert res.status_code == 400
