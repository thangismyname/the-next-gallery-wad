"""Helper dùng chung cho benchmark: đường dẫn, thông tin môi trường, ghi CSV.

Mỗi dòng kết quả kèm đủ metadata (phần cứng, phiên bản thư viện, SHA-256
weights, git commit) để số liệu trong thesis tái lập được.
"""
from __future__ import annotations

import csv
import hashlib
import os
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Không cho Ultralytics tự `pip install` gói thiếu lúc chạy (làm lệch uv.lock).
# Gói cần cho benchmark nằm trong group `bench` của pyproject.toml.
os.environ.setdefault("YOLO_AUTOINSTALL", "False")

SERVICE_ROOT = Path(__file__).resolve().parent.parent
BENCH_ROOT = SERVICE_ROOT / "bench"
RESULTS_DIR = BENCH_ROOT / "results"
RUNS_DIR = BENCH_ROOT / "runs"  # output thô của ultralytics (git-ignored)
MODELS_DIR = SERVICE_ROOT / "models"

def _data_root() -> Path:
    """Dataset nằm NGOÀI repo (nặng). Thứ tự: env TNG_DATASETS → dòng TNG_DATASETS
    trong ai-service/.env hoặc .env gốc dự án → ~/datasets. Mỗi script còn có --data-root."""
    value = os.environ.get("TNG_DATASETS")
    if not value:
        from dotenv import dotenv_values

        for env_file in (SERVICE_ROOT / ".env", SERVICE_ROOT.parent / ".env"):
            if env_file.exists() and (value := dotenv_values(env_file).get("TNG_DATASETS")):
                break
    return Path(value or Path.home() / "datasets").expanduser()


DEFAULT_DATA_ROOT = _data_root()


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sysctl(key: str) -> str:
    try:
        return subprocess.run(
            ["sysctl", "-n", key], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def _git_commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=SERVICE_ROOT,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def environment_info() -> dict[str, str]:
    """Phần cứng + phiên bản thư viện — ghi vào mỗi dòng kết quả."""
    import torch

    info = {
        "chip": _sysctl("machdep.cpu.brand_string") or platform.processor(),
        "cpu_cores": f"{_sysctl('hw.perflevel0.physicalcpu') or '?'}P+"
        f"{_sysctl('hw.perflevel1.physicalcpu') or '?'}E",
        "ram_gb": str(round(int(_sysctl("hw.memsize") or 0) / 1024**3)),
        "os": f"macOS {platform.mac_ver()[0]}" if platform.mac_ver()[0] else platform.platform(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "git_commit": _git_commit(),
    }
    try:
        import ultralytics

        info["ultralytics"] = ultralytics.__version__
    except ImportError:
        info["ultralytics"] = ""
    return info


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def append_csv(path: Path, row: dict[str, object]) -> None:
    """Thêm 1 dòng vào CSV (tạo header nếu file mới). Cột mới → ghi lại header."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    fieldnames = list(row.keys())
    if path.exists():
        with open(path, newline="") as fh:
            reader = csv.DictReader(fh)
            rows = list(reader)
            for name in reader.fieldnames or []:
                if name not in fieldnames:
                    fieldnames.append(name)
    rows.append(row)
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
