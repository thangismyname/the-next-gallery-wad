"""Lab (admin, chỉ đọc): kết quả `python -m experiments` trên đĩa để vẽ biểu đồ.

Đọc $TNG_DATASETS/Results/oi/<exp>/<run>/{status,config,result}.json + *.csv + events.jsonl
và History/<exp>/index.csv. Không import bench/ / experiments/ (không có trong image prod).
Thư mục không tồn tại → available=false (prod), các endpoint còn lại → 404.
"""

import csv
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam

from app.config import get_settings

router = APIRouter(prefix="/lab")

GROUP = "oi"  # experiments ghi vào Results/oi/<exp>
NAME = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$"  # không '/', không bắt đầu bằng '.' → không thoát thư mục
MAX_ROWS = 5000
MAX_EVENTS = 300


def datasets_root() -> Path:
    return get_settings().datasets_path()


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _num(value: str):
    try:
        return float(value) if value not in ("", "nan") else None
    except ValueError:
        return value


def _read_csv(path: Path) -> dict:
    if not path.is_file():
        raise HTTPException(404, "File không tồn tại")
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        rows = []
        for i, row in enumerate(reader):
            if i >= MAX_ROWS:
                break
            rows.append({k: _num(v) for k, v in row.items() if k is not None})
        truncated = next(reader, None) is not None
    return {"columns": reader.fieldnames or [], "rows": rows, "truncated": truncated}


def _exp_dir(exp: str) -> Path:
    path = datasets_root() / "Results" / GROUP / exp
    if not path.is_dir():
        raise HTTPException(404, "Experiment không tồn tại")
    return path


def _run_dir(exp: str, run_id: str) -> Path:
    path = _exp_dir(exp) / run_id
    if not (path / "status.json").is_file():
        raise HTTPException(404, "Run không tồn tại")
    return path


@router.get("/experiments")
def list_experiments():
    """Mọi experiment + run (status.json), run mới nhất trước."""
    root = datasets_root() / "Results" / GROUP
    if not root.is_dir():
        return {"available": False, "experiments": []}
    experiments = []
    for exp in sorted(p for p in root.iterdir() if p.is_dir() and p.name != "cache"):
        runs = [
            {**(_read_json(run / "status.json") or {}), "run_id": run.name, "smoke": run.name.endswith("-smoke")}
            for run in sorted(exp.iterdir(), reverse=True)
            if (run / "status.json").is_file()
        ]
        if not runs:
            continue
        latest = (_read_json(exp / "latest.json") or {}).get("run_id")
        history = datasets_root() / "History" / exp.name / "index.csv"
        experiments.append({"exp": exp.name, "latest": latest, "has_history": history.is_file(), "runs": runs})
    return {"available": True, "experiments": experiments}


@router.get("/experiments/{exp}/runs/{run_id}")
def get_run(exp: str = PathParam(pattern=NAME), run_id: str = PathParam(pattern=NAME)):
    """status + config + result + danh sách CSV + MAX_EVENTS sự kiện cuối."""
    run = _run_dir(exp, run_id)
    events = []
    try:
        lines = (run / "events.jsonl").read_text(encoding="utf-8").splitlines()[-MAX_EVENTS:]
        events = [e for e in map(_safe_line, lines) if e is not None]
    except OSError:
        pass
    return {
        "exp": exp,
        "run_id": run_id,
        "status": _read_json(run / "status.json"),
        "config": _read_json(run / "config.json"),
        "result": _read_json(run / "result.json"),
        "files": [{"name": f.name, "size": f.stat().st_size} for f in sorted(run.glob("*.csv"))],
        "events": events,
    }


def _safe_line(line: str):
    try:
        return json.loads(line)
    except ValueError:
        return None


@router.get("/experiments/{exp}/runs/{run_id}/files/{name}")
def get_run_file(
    exp: str = PathParam(pattern=NAME),
    run_id: str = PathParam(pattern=NAME),
    name: str = PathParam(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.csv$"),
):
    """1 file CSV của run → { columns, rows (số đã ép kiểu), truncated }."""
    return _read_csv(_run_dir(exp, run_id) / name)


@router.get("/history/{exp}")
def get_history(exp: str = PathParam(pattern=NAME)):
    """History/<exp>/index.csv — mỗi dòng 1 version (vNNN) đã lưu."""
    return _read_csv(datasets_root() / "History" / exp / "index.csv")
