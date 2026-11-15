"""Lõi chung: đường dẫn, tham số (dataclass), Run (log / tiến độ / kết quả).

Mỗi lần chạy 1 thí nghiệm tạo thư mục:

    $TNG_DATASETS/Results/oi/<exp>/<run_id>/
        config.json     tham số đã dùng + môi trường (chip, torch, git commit)
        status.json     state (running|done|failed), stage, progress — UI poll file này
        events.jsonl    log + tiến độ theo thời gian (1 JSON / dòng)
        result.json     kết quả tóm tắt (bảng chính, metric tổng)
        *.csv           bảng chi tiết (theo lớp, theo query…)
        artifacts/      thứ thí nghiệm sau dùng lại (ngưỡng, calibrator, điểm)

`<exp>/latest.json` trỏ tới run chính thức mới nhất (`latest_smoke.json` cho run
smoke) — thí nghiệm sau (E5 cần E2 + E4) đọc từ đó nếu không chỉ định run.

Run chính thức (không smoke) xong còn được lưu bản sao vào History/<exp>/vNNN_…/ và
thêm 1 dòng vào History/<exp>/index.csv (máy, commit, dữ liệu, metric chính) — đổi máy,
đổi dữ liệu hay tham số thì bản cũ vẫn còn để so sánh.
"""
from __future__ import annotations

import csv
import json
import math
import shutil
import time
import traceback
import types
import typing
from dataclasses import MISSING, asdict, dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path

from bench.common import (
    DEFAULT_DATA_ROOT,
    cache_dir_root,
    classes_dir,
    data_dir,
    environment_info,
    history_dir,
    results_dir,
)

EXPERIMENTS_ROOT = Path(__file__).resolve().parent
PACKAGE_DATA = EXPERIMENTS_ROOT / "data"  # mapping lớp, query mẫu (commit vào repo)


# ── Đường dẫn dữ liệu ─────────────────────────────────────────────────────
def oi_classes_root(data_root: Path) -> Path:
    """Annotation + subset Open Images: Classes/open-images/"""
    return classes_dir(data_root, "open-images")


def oi_images_root(data_root: Path) -> Path:
    """Ảnh Open Images: Data/open-images/<split>/"""
    return data_dir(data_root, "open-images")


def result_root(data_root: Path) -> Path:
    return results_dir(data_root, "oi")


def cache_root(data_root: Path) -> Path:
    return cache_dir_root(data_root, "oi")


# ── Tham số ───────────────────────────────────────────────────────────────
def opt(default, help: str, choices=None):
    """Field dataclass có help (+ choices) — CLI và UI đọc cùng metadata."""
    meta = {"help": help}
    if choices:
        meta["choices"] = list(choices)
    if isinstance(default, list):
        return field(default_factory=lambda: list(default), metadata=meta)
    return field(default=default, metadata=meta)


@dataclass
class CommonParams:
    data_root: str = opt(str(DEFAULT_DATA_ROOT), "Thư mục Datasets (TNG_DATASETS).")
    device: str = opt("auto", "auto | mps | cpu | cuda")
    smoke: int = opt(0, "≠0 → chỉ N ảnh mỗi split, kết quả đánh dấu smoke (kiểm tra nhanh).")
    note: str = opt("", "Ghi chú tự do lưu vào config.json.")
    latest: bool = opt(True, "Ghi latest.json (run mặc định cho thí nghiệm sau / report). --no-latest = run biến thể "
                             "(vd E4 với YOLO fine-tune) — thí nghiệm sau phải chỉ định run id.")

    @property
    def root(self) -> Path:
        return Path(self.data_root).expanduser()


def _type_name(tp) -> str:
    origin = typing.get_origin(tp)
    if origin in (list, typing.List):
        return "list[" + _type_name(typing.get_args(tp)[0]) + "]"
    if origin in (typing.Union, types.UnionType):
        return " | ".join(_type_name(a) for a in typing.get_args(tp))
    return getattr(tp, "__name__", str(tp))


def params_schema(cls) -> list[dict]:
    """Mô tả tham số dạng JSON — admin UI dựng form từ đây."""
    hints = typing.get_type_hints(cls)
    out = []
    for f in fields(cls):
        default = f.default if f.default is not MISSING else (
            f.default_factory() if f.default_factory is not MISSING else None)
        out.append({"name": f.name, "type": _type_name(hints[f.name]), "default": default,
                    "help": f.metadata.get("help", ""), "choices": f.metadata.get("choices")})
    return out


def add_params_to_parser(parser, cls) -> None:
    import argparse

    hints = typing.get_type_hints(cls)
    for f in fields(cls):
        tp = hints[f.name]
        flag = "--" + f.name.replace("_", "-")
        kwargs = {"dest": f.name, "help": f.metadata.get("help", "").replace("%", "%%"), "default": argparse.SUPPRESS}
        if f.metadata.get("choices"):
            kwargs["choices"] = f.metadata["choices"]
        if tp is bool:
            parser.add_argument(flag, action=argparse.BooleanOptionalAction, **kwargs)
        elif typing.get_origin(tp) is list:
            inner = typing.get_args(tp)[0]
            parser.add_argument(flag, nargs="+", type=inner, **kwargs)
        else:
            if typing.get_origin(tp) in (typing.Union, types.UnionType):
                tp = next(a for a in typing.get_args(tp) if a is not type(None))
            parser.add_argument(flag, type=tp, **kwargs)


def params_from(cls, values: dict):
    known = {f.name for f in fields(cls)}
    unknown = set(values) - known
    if unknown:
        raise SystemExit(f"Tham số không hợp lệ cho {cls.__name__}: {sorted(unknown)}")
    return cls(**values)


# ── Run ───────────────────────────────────────────────────────────────────
def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _jsonable(value):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if hasattr(value, "item") and callable(value.item):  # numpy scalar
        return _jsonable(value.item())
    if isinstance(value, Path):
        return str(value)
    return value


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(_jsonable(data), ensure_ascii=False, indent=2))
    tmp.replace(path)  # ghi nguyên tử — UI không đọc phải file dở dang


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    for row in rows:
        for k in row:
            if k not in names:
                names.append(k)
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=names)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: _fmt(v) for k, v in row.items()})


def _fmt(v):
    if isinstance(v, float):
        return "" if math.isnan(v) else round(v, 5)
    return v


NO_HISTORY = {"select", "build"}  # bước chuẩn bị dữ liệu — không phải kết quả đo


class Run:
    """1 lần chạy thí nghiệm. Dùng: `with Run("e2", params) as run: ...`."""

    def __init__(self, exp: str, params, quiet: bool = False, resume: str = "") -> None:
        """`resume` = run id có sẵn (bị dừng giữa chừng) → ghi tiếp vào đúng thư mục đó."""
        self.exp = exp
        self.params = params
        self.smoke = bool(getattr(params, "smoke", 0))
        base = result_root(params.root) / exp
        self.resumed = bool(resume)
        if resume:
            if not (base / resume / "config.json").exists():
                raise FileNotFoundError(f"không có run {exp}/{resume} để chạy tiếp")
            self.run_id = resume
        else:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            self.run_id = stamp + ("-smoke" if self.smoke else "")
            n = 1
            while (base / self.run_id).exists():  # 2 run trong cùng 1 giây
                n += 1
                self.run_id = f"{stamp}-{n}" + ("-smoke" if self.smoke else "")
        self.dir = base / self.run_id
        self.artifacts = self.dir / "artifacts"
        self.quiet = quiet
        self._t0 = time.perf_counter()
        self._stage = ""
        self._last_progress = 0.0
        self.summary: dict = {}

    # vòng đời
    def __enter__(self) -> "Run":
        self.dir.mkdir(parents=True, exist_ok=True)
        if self.resumed:  # giữ config gốc, chỉ ghi thêm lần chạy tiếp
            cfg = json.loads((self.dir / "config.json").read_text())
            cfg.setdefault("resumed", []).append({"at": utc_now(), "params": asdict(self.params)})
            write_json(self.dir / "config.json", cfg)
        else:
            write_json(self.dir / "config.json", {
                "exp": self.exp, "run_id": self.run_id, "started": utc_now(),
                "params": asdict(self.params), "environment": environment_info(),
            })
        self._status("running")
        self.log(f"run {self.exp}/{self.run_id} → {self.dir}" + (" (chạy tiếp)" if self.resumed else ""))
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc is None:
            write_json(self.dir / "result.json", self.summary)
            self._status("done")
            pointer = "latest_smoke.json" if self.smoke else "latest.json"
            if getattr(self.params, "latest", True):
                write_json(self.dir.parent / pointer, {"run_id": self.run_id, "finished": utc_now()})
            else:
                self.log(f"  --no-latest: không ghi {pointer} (dùng run id {self.run_id} ở thí nghiệm sau)")
            self.log(f"xong sau {time.perf_counter() - self._t0:.0f}s → {self.dir}")
            if not self.smoke and self.exp not in NO_HISTORY:
                version = archive_run(self.dir, self.exp, self.params.root)
                self.log(f"lưu lịch sử → {version}")
                self._refresh_summaries()
            return False
        self._event("error", message=str(exc), traceback=traceback.format_exc())
        self._status("failed", error=str(exc))
        return False

    def _refresh_summaries(self) -> None:
        """Sau run chính thức E1–E6: cập nhật SUMMARY.md (version mới) + REPORT.md / REPORT.en.md."""
        try:
            from experiments.report import ReportParams, build_report
            from experiments.summary import update_summary

            out = update_summary(self.params.root, f"{self.exp}/{self.run_id}")
            for lang in ("vi", "en"):
                build_report(ReportParams(data_root=str(self.params.root), lang=lang))
            self.log(f"cập nhật tóm tắt → {out}")
        except Exception as exc:  # noqa: BLE001 — tóm tắt lỗi không được làm hỏng run
            self.log(f"! không cập nhật được SUMMARY/REPORT: {exc}")

    # log / tiến độ
    def _event(self, kind: str, **data) -> None:
        with open(self.dir / "events.jsonl", "a") as fh:
            fh.write(json.dumps(_jsonable({"t": utc_now(), "type": kind, **data}), ensure_ascii=False) + "\n")

    def _status(self, state: str, **extra) -> None:
        write_json(self.dir / "status.json", {
            "exp": self.exp, "run_id": self.run_id, "state": state, "stage": self._stage,
            "elapsed_s": round(time.perf_counter() - self._t0, 1), "updated": utc_now(), **extra,
        })

    def log(self, message: str) -> None:
        if not self.quiet:
            print(message, flush=True)
        self._event("log", message=message)

    def stage(self, name: str) -> None:
        self._stage = name
        self.log(f"── {name}")
        self._event("stage", stage=name)
        self._status("running")

    def progress(self, done: int, total: int, label: str = "") -> None:
        """Gọi thoải mái trong vòng lặp — tự giới hạn tần suất ghi file."""
        now = time.perf_counter()
        if done < total and now - self._last_progress < 1.0:
            return
        self._last_progress = now
        if not self.quiet:
            end = "\n" if done >= total else ""
            print(f"\r  {label or self._stage}: {done}/{total}", end=end, flush=True)
        self._event("progress", stage=self._stage, label=label, done=done, total=total)
        self._status("running", progress={"label": label, "done": done, "total": total})

    # kết quả
    def table(self, name: str, rows: list[dict]) -> Path:
        path = self.dir / f"{name}.csv"
        write_csv(path, rows)
        self.summary.setdefault("tables", []).append(name)
        return path

    def save_artifact(self, name: str, data) -> Path:
        path = self.artifacts / name
        if name.endswith(".json"):
            write_json(path, data)
        else:  # .npz
            import numpy as np

            path.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(path, **data)
        return path


def find_run(data_root: Path, exp: str, run_id: str = "", smoke: bool = False) -> Path:
    """Thư mục run của thí nghiệm trước (run_id rỗng → latest / latest_smoke)."""
    base = result_root(data_root) / exp
    if not run_id:
        pointer = base / ("latest_smoke.json" if smoke else "latest.json")
        if not pointer.exists():
            hint = " --smoke N" if smoke else ""
            raise SystemExit(f"Chưa có run {exp}{' smoke' if smoke else ''} nào — chạy "
                             f"`python -m experiments {exp}{hint}` trước.")
        run_id = json.loads(pointer.read_text())["run_id"]
    path = base / run_id
    if not (path / "result.json").exists():
        raise SystemExit(f"Run {path} chưa xong (không có result.json).")
    return path


# ── History (lưu theo version) ────────────────────────────────────────────
HISTORY_README = """# History — kết quả đo theo version

Mỗi thư mục con = 1 thí nghiệm. Mỗi lần chạy chính thức → 1 version không bao giờ ghi đè:

    <exp>/vNNN_<ngày-giờ>_<máy>_<commit>/   bản sao config.json, result.json, *.csv, artifacts/*.json
    <exp>/index.csv                          1 dòng / version: máy, commit, dữ liệu, tham số, metric chính

So sánh khi đổi máy / đổi dữ liệu / đổi tham số: mở index.csv (cột data_fingerprint cho biết
dữ liệu có khác không). Lưu tay: `uv run python -m experiments archive <exp>` (run mới nhất)
hoặc `archive bench` (chụp ai-service/bench/results).
"""

_KEEP_SUFFIXES = {".json", ".csv", ".html", ".md", ".tex", ".jsonl"}


def _slug(text: str) -> str:
    import re

    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-") or "unknown"


def _next_version(base: Path) -> int:
    nums = [int(p.name[1:4]) for p in base.glob("v[0-9][0-9][0-9]_*") if p.is_dir()]
    return max(nums, default=0) + 1


def _flat_metrics(data, prefix: str = "", depth: int = 0, out: dict | None = None) -> dict:
    """Số vô hướng trong result.json (sâu ≤3) → cột index.csv."""
    out = {} if out is None else out
    if isinstance(data, dict) and depth <= 3:
        for k, v in data.items():
            if k in ("rows", "tables", "per_class", "reliability_test", "groups"):
                continue
            _flat_metrics(v, f"{prefix}{k}.", depth + 1, out)
    elif isinstance(data, bool):
        out[prefix.rstrip(".")] = data
    elif isinstance(data, (int, float)) and not (isinstance(data, float) and math.isnan(data)):
        out[prefix.rstrip(".")] = round(float(data), 5)
    return out


def data_fingerprint(data_root: Path) -> str:
    """Mapping lớp + số ảnh subset — đổi dữ liệu thì chuỗi này đổi."""
    sub = oi_classes_root(data_root) / "subset"
    parts = []
    classes = sub / "classes.json"
    if classes.exists():
        parts.append("map=" + json.loads(classes.read_text()).get("mapping_hash", "?"))
    for split in ("validation", "test"):
        info = sub / f"{split}_build.json"
        if info.exists():
            parts.append(f"{split[:3]}={json.loads(info.read_text()).get('images')}")
    return " ".join(parts)


def _append_index(base: Path, row: dict) -> None:
    index = base / "index.csv"
    rows = []
    if index.exists():
        with open(index, newline="") as fh:
            rows = list(csv.DictReader(fh))
    rows.append({k: v for k, v in row.items()})
    write_csv(index, rows)


def archive_run(run_dir: Path, exp: str, data_root: Path) -> Path:
    """Chép run vào History/<exp>/vNNN_… + thêm dòng index.csv. Trả thư mục version."""
    hist = history_dir(data_root)
    hist.mkdir(parents=True, exist_ok=True)
    if not (hist / "README.md").exists():
        (hist / "README.md").write_text(HISTORY_README, encoding="utf-8")
    base = hist / exp
    base.mkdir(parents=True, exist_ok=True)
    config = json.loads((run_dir / "config.json").read_text()) if (run_dir / "config.json").exists() else {}
    env = config.get("environment", {})
    version = _next_version(base)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    name = f"v{version:03d}_{stamp}_{_slug(env.get('chip', 'unknown'))}_{env.get('git_commit') or 'nogit'}"
    target = base / name
    for path in run_dir.rglob("*"):
        if path.is_file() and path.suffix in _KEEP_SUFFIXES:
            dest = target / path.relative_to(run_dir)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
    result = json.loads((run_dir / "result.json").read_text()) if (run_dir / "result.json").exists() else {}
    params = config.get("params", {})
    _append_index(base, {
        "version": f"v{version:03d}", "archived_at": utc_now(), "run_id": run_dir.name, "folder": name,
        "chip": env.get("chip", ""), "ram_gb": env.get("ram_gb", ""), "os": env.get("os", ""),
        "torch": env.get("torch", ""), "git_commit": env.get("git_commit", ""),
        "device": params.get("device", ""), "data_fingerprint": data_fingerprint(data_root),
        "note": params.get("note", ""),
        "params": json.dumps({k: v for k, v in params.items() if k not in ("data_root", "note")},
                             ensure_ascii=False),
        **_flat_metrics(result),
    })
    return target


def archive_folder(source: Path, exp: str, data_root: Path, note: str = "") -> Path:
    """Chụp 1 thư mục kết quả bất kỳ (vd ai-service/bench/results) vào History/<exp>/vNNN_…"""
    from bench.common import environment_info as env_info

    base = history_dir(data_root, exp)
    base.mkdir(parents=True, exist_ok=True)
    env = env_info()
    version = _next_version(base)
    name = f"v{version:03d}_{datetime.now().strftime('%Y%m%d-%H%M')}_{_slug(env.get('chip', ''))}_" \
           f"{env.get('git_commit') or 'nogit'}"
    target = base / name
    for path in source.rglob("*"):
        if path.is_file() and path.suffix in _KEEP_SUFFIXES and "_smoke" not in path.name:
            dest = target / path.relative_to(source)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
    _append_index(base, {"version": f"v{version:03d}", "archived_at": utc_now(), "folder": name,
                         "source": str(source), "chip": env.get("chip", ""), "os": env.get("os", ""),
                         "torch": env.get("torch", ""), "git_commit": env.get("git_commit", ""), "note": note})
    return target
