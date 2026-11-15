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

PROJECT_ROOT = SERVICE_ROOT.parent
DEFAULT_DATASETS_DIR = PROJECT_ROOT / "database" / "datasets"  # nằm trong repo, Data/ + Classes/ gitignored


def _data_root() -> Path:
    """Thư mục dataset. Mặc định <repo>/database/datasets. Ghi đè: env TNG_DATASETS → dòng
    TNG_DATASETS trong ai-service/.env hoặc .env gốc. Path tương đối tính từ gốc repo.
    Mỗi script còn có --data-root."""
    value = os.environ.get("TNG_DATASETS")
    if not value:
        from dotenv import dotenv_values

        for env_file in (SERVICE_ROOT / ".env", SERVICE_ROOT.parent / ".env"):
            if env_file.exists() and (value := dotenv_values(env_file).get("TNG_DATASETS")):
                break
    if not value:
        return DEFAULT_DATASETS_DIR
    path = Path(value).expanduser()
    return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()


DEFAULT_DATA_ROOT = _data_root()


# ── Bố cục thư mục Datasets (1 chỗ duy nhất — bench, pipeline, experiments cùng dùng) ──
#   Data/<dataset>/      ảnh + thứ model đọc ngay cạnh ảnh (YOLO labels/*.txt, yaml, list,
#                        webdataset .tar của clip_benchmark, ImageFolder đã dựng)
#   Classes/<dataset>/   danh sách lớp + annotation (CSV / JSON / PKL), subset đã chọn
#   Results/<nhóm>/      kết quả chạy hiện tại (run, ảnh vẽ box, cache feature ở Results/cache)
#   History/<exp>/       bản lưu theo version (vNNN) của mọi lần đo — không bao giờ ghi đè
DATA, CLASSES, RESULTS, HISTORY = "Data", "Classes", "Results", "History"


def _root(data_root: Path | str | None) -> Path:
    return Path(data_root or DEFAULT_DATA_ROOT).expanduser().resolve()


def data_dir(data_root: Path | str | None, name: str = "") -> Path:
    return _root(data_root) / DATA / name if name else _root(data_root) / DATA


def classes_dir(data_root: Path | str | None, name: str = "") -> Path:
    return _root(data_root) / CLASSES / name if name else _root(data_root) / CLASSES


def results_dir(data_root: Path | str | None, name: str = "") -> Path:
    return _root(data_root) / RESULTS / name if name else _root(data_root) / RESULTS


def cache_dir_root(data_root: Path | str | None, name: str) -> Path:
    """Cache feature (tính lại được): Results/cache/<name>."""
    return _root(data_root) / RESULTS / "cache" / name


def history_dir(data_root: Path | str | None, name: str = "") -> Path:
    return _root(data_root) / HISTORY / name if name else _root(data_root) / HISTORY


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
