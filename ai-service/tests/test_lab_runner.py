import json
import re

import pytest

from app.api import lab, lab_runner
from experiments import jobs

SCHEMA = {"commands": {"e4": {"help": "", "params": [{"name": "weights"}, {"name": "latest"}]},
                       "e5": {"help": "", "params": [{"name": "e4_ft_run"}]}}, "presets": {}}


@pytest.fixture
def root(tmp_path, monkeypatch):
    (tmp_path / "Results" / "oi").mkdir(parents=True)
    monkeypatch.setattr(lab, "datasets_root", lambda: tmp_path)
    monkeypatch.setattr(lab_runner, "datasets_root", lambda: tmp_path)
    monkeypatch.setattr(lab_runner, "_describe", lambda: SCHEMA)
    monkeypatch.setattr(lab_runner, "_external_running", lambda: False)
    spawned = []
    monkeypatch.setattr(lab_runner.subprocess, "Popen", lambda argv, **kw: spawned.append(argv) or
                        type("P", (), {"pid": 999999})())
    return tmp_path, spawned


def test_start_job_validates_and_spawns(client, root):
    root, spawned = root
    bad = client.post("/api/v1/lab/runner/jobs", json={"steps": [{"cmd": "e5", "params": {"e4_ft_run": "$E4"}}]})
    assert bad.status_code == 400 and "$E4" in bad.json()["detail"]
    assert client.post("/api/v1/lab/runner/jobs", json={"steps": [{"cmd": "judge"}]}).status_code == 400
    assert client.post("/api/v1/lab/runner/jobs",
                       json={"steps": [{"cmd": "e4", "params": {"x": 1}}]}).status_code == 400

    ok = client.post("/api/v1/lab/runner/jobs", json={"steps": [
        {"cmd": "e4", "params": {"weights": "a.pt"}, "save_as": "E4"},
        {"cmd": "e5", "params": {"e4_ft_run": "$E4"}},
    ]})
    assert ok.status_code == 201
    job_id = ok.json()["id"]
    assert spawned[0][-2:] == ["run", str(root / "Results" / "runner" / job_id)]
    # job vừa tạo (queued) chặn job thứ hai
    again = client.post("/api/v1/lab/runner/jobs", json={"steps": [{"cmd": "e4"}]})
    assert again.status_code == 409
    state = client.get("/api/v1/lab/runner").json()
    assert state["available"] and state["active"]["id"] == job_id


def test_lost_job_and_log_tail(client, root):
    root, _ = root
    job_dir = root / "Results" / "runner" / "20261119-120000"
    job_dir.mkdir(parents=True)
    (job_dir / "job.json").write_text(json.dumps({"id": job_dir.name, "state": "running", "pid": 999999,
                                                 "steps": [{"cmd": "e4"}]}))
    (job_dir / "log.txt").write_text("a\n  ảnh 1/2\r  ảnh 2/2\n")
    body = client.get(f"/api/v1/lab/runner/jobs/{job_dir.name}").json()
    assert body["state"] == "lost" and body["log"] == "a\n  ảnh 2/2\n"
    assert client.get("/api/v1/lab/runner").json()["active"] is None


def test_delete_run_keeps_latest(client, root):
    root, _ = root
    exp = root / "Results" / "oi" / "e4"
    for rid in ("r1", "r2"):
        (exp / rid).mkdir(parents=True)
        (exp / rid / "status.json").write_text('{"state": "done"}')
    (exp / "latest.json").write_text('{"run_id": "r1"}')
    assert client.delete("/api/v1/lab/experiments/e4/runs/r1").status_code == 409
    assert client.delete("/api/v1/lab/experiments/e4/runs/r2").status_code == 200
    assert not (exp / "r2").exists()


def test_suite_variables_are_defined_before_use():
    defined = set()
    for step in jobs.PRESETS["all"]["steps"]:
        for v in step["params"].values():
            if isinstance(v, str) and v.startswith("$"):
                assert v[1:] in defined, v
        if step.get("save_as"):
            assert re.match(lab_runner.VAR, step["save_as"])
            defined.add(step["save_as"])


def test_run_job_chains_run_ids(tmp_path, monkeypatch):
    job_dir = tmp_path / "Results" / "runner" / "j1"
    job_dir.mkdir(parents=True)
    jobs.write_job(job_dir, {"id": "j1", "state": "queued", "steps": [
        {"cmd": "e4", "params": {"data_root": "/x"}, "save_as": "E4"},
        {"cmd": "e5", "params": {"e4_ft_run": "$E4"}},
        {"cmd": "e5", "params": {}},
    ]})
    calls = []

    class FakeProc:
        def __init__(self, argv, **_):
            cmd, params = argv[3], json.loads(argv[5])
            calls.append((cmd, params))
            run = tmp_path / "Results" / "oi" / cmd / f"run{len(calls)}"
            run.mkdir(parents=True)
            (run / "status.json").write_text("{}")
            self.code = 1 if len(calls) == 3 else 0

        def wait(self, *_):
            return self.code

    monkeypatch.setattr(jobs.subprocess, "Popen", FakeProc)
    assert jobs.run_job(job_dir) == 1
    assert calls[0] == ("e4", {})  # data_root bị bỏ: luôn dùng Datasets của job
    assert calls[1] == ("e5", {"e4_ft_run": "run1"})
    job = json.loads((job_dir / "job.json").read_text())
    assert job["state"] == "failed" and [s["state"] for s in job["steps"]] == ["done", "done", "failed"]
    assert job["steps"][0]["run_id"] == "run1"


def _assert_chain(steps):
    defined = set()
    for step in steps:
        for v in step["params"].values():
            for x in v if isinstance(v, list) else [v]:
                for name in lab_runner.VAR_USE.findall(x) if isinstance(x, str) else []:
                    assert name in defined, (name, step)
        if step.get("save_as"):
            defined.add(step["save_as"])


def test_build_suite_any_subset_keeps_chain():
    import itertools

    for n in range(1, len(jobs.SUITE_STEPS) + 1):
        for subset in itertools.combinations(jobs.SUITE_STEPS, n):
            for mode in ("eval", "train", "skip"):
                _assert_chain(jobs.build_suite({"steps": list(subset), "yolo_ft": mode,
                                                "models": {"ft": ["a.pt", "b.pt"], "ft_main": "new"}}))


def test_build_suite_models_and_overrides():
    steps = jobs.build_suite({
        "steps": ["e2", "e4", "yolo_ft", "e5"], "smoke": 50, "yolo_ft": "train",
        "models": {"clip": "ViT-L-14:x", "yolo": "yolov10n.pt", "ft": ["a.pt"], "ft_main": "new"},
        "overrides": {"yolo_ft": {"epochs": 5}, "e4": {"weights": "ignored-for-variants.pt"}},
    })
    by = [(s["cmd"], s.get("save_as")) for s in steps]
    assert by == [("e2", None), ("e4", None), ("yolo_ft", "YFT"), ("e4", "E4_1"), ("e4", "E4_2"),
                  ("e5", "E5_1"), ("e5", None)]
    assert steps[0]["params"]["clip"] == "ViT-L-14:x" and steps[0]["params"]["smoke"] == 50
    assert steps[1]["params"]["weights"] == "ignored-for-variants.pt"  # override thắng model chung
    assert steps[2]["params"]["epochs"] == 5 and steps[2]["params"]["base"] == "yolov10n.pt"
    assert steps[4]["params"]["weights"] == "yolo26n-oi-$YFT.pt"  # khoá nối chuỗi thắng override
    assert steps[6]["params"]["e4_ft_run"] == "$E4_2"  # model mới = chuỗi chính
    assert jobs.substitute(["yolo26n-oi-$YFT.pt", "$E4_1"], {"YFT": "r9", "E4_1": "r1"}) == ["yolo26n-oi-r9.pt", "r1"]
    with pytest.raises(ValueError):
        jobs.build_suite({"steps": ["nope"]})


def test_embedded_var_must_be_defined(client, root):
    bad = client.post("/api/v1/lab/runner/jobs", json={"steps": [{"cmd": "e4", "params": {"weights": "x-$YFT.pt"}}]})
    assert bad.status_code == 400 and "$YFT" in bad.json()["detail"]
