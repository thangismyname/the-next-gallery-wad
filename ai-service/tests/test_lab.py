import json

from app.api import lab


def _make_run(root, exp="e2", run_id="20261107-033218"):
    run = root / "Results" / "oi" / exp / run_id
    run.mkdir(parents=True)
    (run / "status.json").write_text(json.dumps({"exp": exp, "state": "done"}))
    (run / "result.json").write_text(json.dumps({"test": {"mAP": 0.88}}))
    (run / "events.jsonl").write_text('{"type": "log"}\nnot json\n')
    (run / "per_class.csv").write_text("class,AP,note\ndog,0.9,x\ncat,,y\n")
    (root / "Results" / "oi" / exp / "latest.json").write_text(json.dumps({"run_id": run_id}))
    hist = root / "History" / exp
    hist.mkdir(parents=True)
    (hist / "index.csv").write_text("version,test.mAP\nv001,0.88\n")


def test_lab_unavailable(client, tmp_path, monkeypatch):
    monkeypatch.setattr(lab, "datasets_root", lambda: tmp_path / "missing")
    assert client.get("/api/v1/lab/experiments").json() == {"available": False, "experiments": []}


def test_lab_reads_runs(client, tmp_path, monkeypatch):
    monkeypatch.setattr(lab, "datasets_root", lambda: tmp_path)
    _make_run(tmp_path)
    body = client.get("/api/v1/lab/experiments").json()
    assert body["available"] is True
    exp = body["experiments"][0]
    assert exp["exp"] == "e2" and exp["latest"] == "20261107-033218" and exp["has_history"]

    run = client.get("/api/v1/lab/experiments/e2/runs/20261107-033218").json()
    assert run["result"]["test"]["mAP"] == 0.88
    assert run["files"][0]["name"] == "per_class.csv"
    assert run["events"] == [{"type": "log"}]  # dòng hỏng bị bỏ

    csv = client.get("/api/v1/lab/experiments/e2/runs/20261107-033218/files/per_class.csv").json()
    assert csv["columns"] == ["class", "AP", "note"]
    assert csv["rows"][0] == {"class": "dog", "AP": 0.9, "note": "x"}
    assert csv["rows"][1]["AP"] is None

    assert client.get("/api/v1/lab/history/e2").json()["rows"][0]["test.mAP"] == 0.88


def test_lab_rejects_bad_names(client, tmp_path, monkeypatch):
    monkeypatch.setattr(lab, "datasets_root", lambda: tmp_path)
    _make_run(tmp_path)
    assert client.get("/api/v1/lab/experiments/e2/runs/..%2F..").status_code in (404, 422)
    assert client.get("/api/v1/lab/experiments/.hidden/runs/x").status_code == 422
    assert client.get("/api/v1/lab/experiments/e2/runs/20261107-033218/files/status.json").status_code == 422
    assert client.get("/api/v1/lab/experiments/e2/runs/nope").status_code == 404
