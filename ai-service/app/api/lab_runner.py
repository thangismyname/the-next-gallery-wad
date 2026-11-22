"""Lab runner (khu Developer): chạy `python -m experiments` từ UI.

Mỗi job = 1 tiến trình `python -m experiments.jobs run <dir>` tách riêng (start_new_session) → uvicorn --reload
không giết job; trạng thái nằm trên đĩa (Results/runner/<id>/job.json + log.txt). Mỗi lúc chỉ 1 job, và không chạy
khi terminal đang chạy experiments (tranh GPU/MPS + ghi cùng thư mục). Cần source experiments/ (dev, chạy native)
— image prod không có → available=false.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam
from pydantic import BaseModel, Field

from app.api.lab import NAME, _read_json, datasets_root

router = APIRouter(prefix="/lab")

AI_ROOT = Path(__file__).resolve().parents[2]
VAR = r"^[A-Z][A-Z0-9_]{0,23}$"
VAR_USE = re.compile(r"\$([A-Z][A-Z0-9_]*)")  # "$E4_1" hoặc trong chuỗi "yolo26n-oi-$YFT.pt"
LOG_TAIL_BYTES = 64_000


class Step(BaseModel):
    cmd: str = Field(pattern=NAME)
    params: dict = Field(default_factory=dict)
    save_as: str | None = Field(default=None, pattern=VAR)


class PlanRequest(BaseModel):
    options: dict = Field(default_factory=dict)


class JobRequest(BaseModel):
    steps: list[Step] = Field(min_length=1, max_length=60)
    label: str = Field(default="", max_length=120)


def runner_root() -> Path:
    return datasets_root() / "Results" / "runner"


def _available() -> str | None:
    """None = chạy được; còn lại = lý do."""
    if not (AI_ROOT / "experiments" / "jobs.py").is_file():
        return "ai-service này không có experiments/ (image prod) — chạy ai-service native để chạy benchmark"
    if not (datasets_root() / "Results").is_dir() or not os.access(datasets_root() / "Results", os.W_OK):
        return "Thư mục Datasets/Results không tồn tại hoặc chỉ đọc (Docker mount ro)"
    return None


def _jobs_cli(*args: str) -> str:
    """`python -m experiments.jobs …` (không import experiments vào app). Lỗi tuỳ chọn → 400 kèm dòng cuối stderr."""
    out = subprocess.run([sys.executable, "-m", "experiments.jobs", *args], cwd=AI_ROOT, capture_output=True,
                         text=True, timeout=120, env={**os.environ, "TNG_DATASETS": str(datasets_root())})
    if out.returncode != 0:
        lines = out.stderr.strip().splitlines()
        raise HTTPException(400, (lines[-1] if lines else "experiments.jobs lỗi")[:300])
    return out.stdout


def _describe() -> dict:
    # không cache: danh sách model đổi khi train xong 1 YOLO fine-tune (~0.2 s mỗi lần)
    return json.loads(_jobs_cli("describe"))


def _alive(pid) -> bool:
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, TypeError, ValueError):
        return False


def _load(job_dir: Path) -> dict | None:
    job = _read_json(job_dir / "job.json")
    if job and job.get("state") in ("queued", "running") and job.get("pid") and not _alive(job["pid"]):
        job["state"] = "lost"  # tiến trình chết (tắt máy, kill -9) mà không kịp ghi trạng thái
    return job


def _jobs() -> list[dict]:
    root = runner_root()
    dirs = sorted((p for p in root.iterdir() if p.is_dir()), reverse=True) if root.is_dir() else []
    return [j for j in map(_load, dirs) if j]


def _active() -> dict | None:
    # "queued" chưa có pid: vừa spawn, tiến trình chưa kịp ghi — vẫn tính là đang chạy
    return next((j for j in _jobs() if j["state"] in ("queued", "running")), None)


def _external_running() -> bool:
    """Có `python -m experiments …` ngoài runner (terminal)? Không có pgrep (Windows) → bỏ qua."""
    try:
        out = subprocess.run(["pgrep", "-f", r"python[0-9.]* -m experiments( |\.jobs )"],
                             capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return bool(out.stdout.strip())


def _log_tail(job_dir: Path) -> str:
    try:
        with open(job_dir / "log.txt", "rb") as fh:
            fh.seek(max(0, fh.seek(0, 2) - LOG_TAIL_BYTES))
            text = fh.read().decode("utf-8", "replace")
    except OSError:
        return ""
    # thanh tiến độ dùng \r → chỉ giữ trạng thái cuối của mỗi dòng
    return "\n".join(line.rsplit("\r", 1)[-1] for line in text.split("\n"))


def _job_dir(job_id: str) -> Path:
    path = runner_root() / job_id
    if not (path / "job.json").is_file():
        raise HTTPException(404, "Job không tồn tại")
    return path


def _validate(req: JobRequest) -> list[dict]:
    commands = _describe()["commands"]
    defined: set[str] = set()
    steps = []
    for i, step in enumerate(req.steps, 1):
        spec = commands.get(step.cmd)
        if not spec:
            raise HTTPException(400, f"Bước {i}: lệnh '{step.cmd}' không chạy được từ UI")
        allowed = {p["name"] for p in spec["params"]}
        unknown = set(step.params) - allowed
        if unknown:
            raise HTTPException(400, f"Bước {i} ({step.cmd}): tham số lạ {sorted(unknown)}")
        for value in step.params.values():
            for v in value if isinstance(value, list) else [value]:
                for name in VAR_USE.findall(v) if isinstance(v, str) else []:
                    if name not in defined:
                        raise HTTPException(400, f"Bước {i}: ${name} chưa được bước trước lưu (save_as)")
        if step.save_as:
            defined.add(step.save_as)
        steps.append(step.model_dump(exclude_none=True))
    if len(json.dumps(steps)) > 50_000:
        raise HTTPException(400, "Job quá lớn")
    return steps


@router.get("/runner")
def runner_state():
    reason = _available()
    jobs = _jobs() if reason is None else []
    active = next((j for j in jobs if j["state"] in ("queued", "running")), None)
    return {
        "available": reason is None,
        "reason": reason,
        "external_running": reason is None and active is None and _external_running(),
        "active": active,
        "jobs": [{k: j.get(k) for k in ("id", "label", "state", "created", "finished")} | {"steps": len(j["steps"])}
                 for j in jobs[:20]],
    }


@router.get("/runner/schema")
def runner_schema():
    if reason := _available():
        raise HTTPException(409, reason)
    return _describe()


@router.post("/runner/plan")
def plan_suite(req: PlanRequest):
    """Tuỳ chọn suite (bước, model, override) → các bước — UI xem trước rồi gửi /runner/jobs."""
    if reason := _available():
        raise HTTPException(409, reason)
    options = json.dumps(req.options)
    if len(options) > 20_000:
        raise HTTPException(400, "Tuỳ chọn quá lớn")
    return {"steps": json.loads(_jobs_cli("plan", options))}


@router.post("/runner/jobs", status_code=201)
def start_job(req: JobRequest):
    if reason := _available():
        raise HTTPException(409, reason)
    if _active():
        raise HTTPException(409, "Đang có job chạy — đợi xong hoặc bấm Dừng")
    if _external_running():
        raise HTTPException(409, "Terminal đang chạy experiments — đợi xong rồi chạy từ UI")
    steps = _validate(req)
    from datetime import datetime, timezone

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    job_dir, n = runner_root() / stamp, 1
    while job_dir.exists():
        n += 1
        job_dir = runner_root() / f"{stamp}-{n}"
    job_dir.mkdir(parents=True)
    job = {"id": job_dir.name, "label": req.label or " → ".join(s["cmd"] for s in steps)[:120],
           "created": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
           "state": "queued", "steps": steps}
    (job_dir / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-m", "experiments.jobs", "run", str(job_dir)], cwd=AI_ROOT,
                            env={**os.environ, "TNG_DATASETS": str(datasets_root())},
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)
    return {**job, "pid": proc.pid}


@router.get("/runner/jobs/{job_id}")
def get_job(job_id: str = PathParam(pattern=NAME)):
    job_dir = _job_dir(job_id)
    return {**_load(job_dir), "log": _log_tail(job_dir)}


@router.post("/runner/jobs/{job_id}/cancel")
def cancel_job(job_id: str = PathParam(pattern=NAME)):
    job = _load(_job_dir(job_id))
    if job.get("state") not in ("queued", "running") or not _alive(job.get("pid")):
        raise HTTPException(409, "Job không còn chạy")
    os.kill(int(job["pid"]), signal.SIGTERM)  # runner tự dừng bước hiện tại + ghi "cancelled"
    return {"ok": True}


@router.delete("/experiments/{exp}/runs/{run_id}")
def delete_run(exp: str = PathParam(pattern=NAME), run_id: str = PathParam(pattern=NAME)):
    """Xoá 1 run khỏi Results/ (History/ giữ nguyên). Không xoá run đang chạy hoặc đang là latest."""
    run = datasets_root() / "Results" / "oi" / exp / run_id
    status = _read_json(run / "status.json")
    if status is None:
        raise HTTPException(404, "Run không tồn tại")
    if status.get("state") == "running" and (_active() or _external_running()):
        raise HTTPException(409, "Run đang chạy — dừng trước khi xoá")  # không có tiến trình nào = run bị bỏ dở
    for pointer in ("latest.json", "latest_smoke.json"):
        if (_read_json(run.parent / pointer) or {}).get("run_id") == run_id:
            raise HTTPException(409, "Run đang là latest (thí nghiệm sau đọc nó) — không xoá được")
    shutil.rmtree(run)
    return {"ok": True}
