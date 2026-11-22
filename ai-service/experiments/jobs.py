"""Hàng đợi chạy experiments — từ Lab UI (khu Developer → Chạy) hoặc terminal.

  python -m experiments.jobs describe        # lệnh + tham số + preset dạng JSON (ai-service đọc cho UI)
  python -m experiments.jobs plan '<json>'   # tuỳ chọn suite (bước, model, override) → các bước (UI xem trước)
  python -m experiments.jobs run <job_dir>   # chạy <job_dir>/job.json (ai-service spawn tiến trình tách riêng)
  python -m experiments.jobs preset all      # chạy preset ngay trong terminal (E1→E6 + 3 YOLO fine-tune)

Job = các bước chạy tuần tự, dừng ở bước lỗi đầu tiên. Bước có `save_as` lưu run id nó vừa tạo vào biến,
bước sau dùng "$TÊN" trong params (vd {"e4_ft_run": "$E4_1"}, {"weights": "yolo26n-oi-$YFT.pt"}).
Trạng thái: <Datasets>/Results/runner/<job_id>/job.json + log.txt (stdout của mọi bước).
SIGTERM (nút Dừng) → dừng bước đang chạy, đánh dấu job + run đó "cancelled".
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
HIDDEN = {"judge"}  # mở server/trình duyệt riêng — không chạy từ UI
SUITE_STEPS = ["e1", "e2", "e3", "e4", "yolo_ft", "e5", "probe", "e6", "report", "summary"]
FT_DEFAULT = [  # YOLO26n fine-tune đã train (models/) — chuỗi chính = cái đầu
    "yolo26n-oi-20261108-021431.pt",  # fine-tune thường
    "yolo26n-oi-20261108-224401.pt",  # nhãn giả
    "yolo26n-oi-20261109-100541.pt",  # nhãn giả + freeze 10
]
CLIP_MODELS = [  # gợi ý cho UI; ô vẫn nhận tên OpenCLIP bất kỳ "<model>:<pretrained>"
    {"id": "ViT-B-32:laion2b_s34b_b79k", "label": "app (ViT-B/32 LAION-2B)"},
    {"id": "ViT-L-14-336:openai", "label": "paper CLIP (ViT-L/14@336 OpenAI)"},
    {"id": "ViT-B-32:openai", "label": "ViT-B/32 OpenAI"},
    {"id": "ViT-L-14:laion2b_s32b_b82k", "label": "ViT-L/14 LAION-2B"},
    {"id": "xlm-roberta-base-ViT-B-32:laion5b_s13b_b90k", "label": "đa ngôn ngữ (XLM-R B/32)"},
]
# tham số nào là model → loại model trong catalog (UI hiện gợi ý)
MODEL_PARAMS = {"models": "clip", "clip": "clip", "multilingual_clip": "clip", "pseudo_clip": "clip",
                "dino": "dino", "weights": "yolo", "yolo": "yolo", "base": "yolo"}
# bước → {tham số: khoá trong opts["models"]} — model chọn 1 lần cho cả suite (UI ẩn các ô này ở từng bước)
SUITE_MODEL_KEYS = {
    "e1": {"models": "e1"}, "e2": {"clip": "clip"}, "e3": {"clip": "clip"}, "e4": {"weights": "yolo"},
    "yolo_ft": {"base": "yolo"}, "probe": {"clip": "clip", "dino": "dino", "yolo": "yolo"}, "e6": {"clip": "clip"},
}
VAR_RE = re.compile(r"\$([A-Z][A-Z0-9_]*)")


def _step(cmd: str, save_as: str = "", **params) -> dict:
    return {"cmd": cmd, "params": params, **({"save_as": save_as} if save_as else {})}


def build_suite(opts: dict) -> list[dict]:
    """Tuỳ chọn UI → các bước. opts (mọi khoá tuỳ chọn):
      steps       bước chạy (trong SUITE_STEPS, giữ thứ tự pipeline)       smoke · device · note   áp cho mọi bước
      models      {clip, e1: [..], dino, yolo, ft: [weights..], ft_main: weights | "new"}
      yolo_ft     "eval" (chấm lại từng ft) | "train" (train mới → thêm vào ft) | "skip"
      overrides   {cmd: {param: value}} — tham số riêng từng bước (thua các khoá nối chuỗi: weights, *_run, latest…)
    Mỗi model fine-tune k = 1 chuỗi biến thể E4_k → E5_k → P_k → E6 (chuỗi chính ghi latest).
    """
    on = set(opts.get("steps") or SUITE_STEPS)
    unknown = on - set(SUITE_STEPS)
    if unknown:
        raise ValueError(f"bước lạ: {sorted(unknown)}")
    m = opts.get("models") or {}
    ft = [str(f) for f in (m.get("ft") or [])]
    over = opts.get("overrides") or {}
    note = str(opts.get("note") or "")
    common = {k: opts[k] for k in ("smoke", "device") if opts.get(k)}
    out: list[dict] = []

    def add(cmd: str, save_as: str = "", tag: str = "", **chain):
        models = {param: m[key] for param, key in SUITE_MODEL_KEYS.get(cmd, {}).items() if m.get(key)}
        label = " · ".join(x for x in (note, tag) if x)
        params = {**common, **models, **({"note": label} if label else {}), **over.get(cmd, {}), **chain}
        out.append(_step(cmd, save_as, **params))

    for cmd in ("e1", "e2", "e3", "e4"):
        if cmd in on:
            add(cmd)
    mode = opts.get("yolo_ft") or "eval"
    if "yolo_ft" in on and mode == "train":
        add("yolo_ft", "YFT", "train mới")
        ft.append("yolo26n-oi-$YFT.pt")  # yolo_ft chép best.pt thành models/yolo26n-oi-<run_id>.pt
    elif "yolo_ft" in on and mode == "eval":
        for i, f in enumerate(ft):  # cái cuối ghi latest (như khi chạy tay)
            add("yolo_ft", "", f"chấm lại {f}", eval_only=True, weights=f, latest=i == len(ft) - 1)
    main_name = m.get("ft_main")
    main = ft.index("yolo26n-oi-$YFT.pt") if main_name == "new" and "yolo26n-oi-$YFT.pt" in ft else (
        ft.index(main_name) if main_name in ft else 0)
    keys = [str(i + 1) for i in range(len(ft))]
    has_e4 = "e4" in on and ft
    if has_e4:
        for k, f in zip(keys, ft):
            add("e4", f"E4_{k}", f"FT {k}: {f}", weights=f, latest=False)
    if "e5" in on:
        if has_e4:
            for i, k in enumerate(keys):
                if i == main:
                    add("e5", "", f"FT {k} (chính)", e4_ft_run=f"$E4_{k}")
                else:
                    add("e5", f"E5_{k}", f"FT {k}", e4_ft_run=f"$E4_{k}", latest=False)
        else:
            add("e5")
    if "probe" in on:
        add("probe")
        for k, f in zip(keys, ft):
            add("probe", f"P_{k}", f"FT {k}: {f}", configs=["fused_learned"], yolo=f, latest=False)
    if "e6" in on:
        if "probe" in on and ft:
            add("e6", "", f"FT {keys[main]} (chính)", probe_ft_run=f"$P_{keys[main]}")
            if "e5" in on and has_e4:
                for i, k in enumerate(keys):
                    if i != main:
                        add("e6", "", f"FT {k}", e5_run=f"$E5_{k}", probe_ft_run=f"$P_{k}", latest=False)
        else:
            add("e6")
    for cmd in ("report", "summary"):
        if cmd in on:
            add(cmd)
    return out


SUITE_DEFAULT = {"steps": SUITE_STEPS, "yolo_ft": "eval", "models": {"ft": FT_DEFAULT}}
PRESETS = {"all": {"label": "E1 → E6 + 3 YOLO fine-tune (chấm lại, không train)", "steps": build_suite(SUITE_DEFAULT)}}


def model_catalog(root: Path) -> dict:
    """Model có trên máy (ai-service/models/) — YOLO fine-tune kèm mô tả từ config run yolo_ft."""
    models = AI_ROOT / "models"
    files = sorted(models.glob("*.pt")) if models.is_dir() else []
    yolo = [{"id": p.name} for p in files if not p.name.startswith("yolo26n-oi-") and "-cls" not in p.name]
    ft = []
    for p in files:
        if not p.name.startswith("yolo26n-oi-") or p.stem.endswith("-smoke"):
            continue
        run_id = p.stem.removeprefix("yolo26n-oi-")
        try:
            cfg = json.loads((root / "Results" / "oi" / "yolo_ft" / run_id / "config.json").read_text())["params"]
            bits = [f"{cfg.get('epochs')} epoch", "nhãn giả" if cfg.get("pseudo_label") else "",
                    f"freeze {cfg['freeze']}" if cfg.get("freeze") else ""]
            label = cfg.get("note") or " · ".join(b for b in bits if b)
        except (OSError, ValueError, KeyError):
            label = ""
        ft.append({"id": p.name, "label": label, "run_id": run_id})
    dino = [{"id": p.name} for p in sorted(models.iterdir()) if (p / "config.json").is_file()] if models.is_dir() else []
    return {"clip": CLIP_MODELS, "yolo": yolo, "yolo_ft": ft, "dino": dino}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_job(job_dir: Path, job: dict) -> None:
    tmp = job_dir / "job.json.tmp"
    tmp.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(job_dir / "job.json")  # UI không bao giờ đọc được file ghi dở


def substitute(value, names: dict):
    """"$TÊN" (đứng riêng hoặc trong chuỗi, vd "yolo26n-oi-$YFT.pt") → run id đã lưu, cả trong list.
    Biến chưa có → KeyError (bước trước chưa chạy / không tạo run)."""
    if isinstance(value, list):
        return [substitute(v, names) for v in value]
    if not isinstance(value, str):
        return value

    def repl(match: re.Match) -> str:
        if match[1] not in names:
            raise KeyError(f"biến ${match[1]} chưa có (bước nào có save_as={match[1]}?)")
        return names[match[1]]

    return VAR_RE.sub(repl, value)


def argv_for(cmd: str, params: dict) -> list[str]:
    if cmd == "archive":
        return ["archive", params["name"], *(["--run-id", params["run_id"]] if params.get("run_id") else [])]
    return [cmd, "--params-json", json.dumps(params)]


def _run_ids(root: Path, cmd: str) -> set[str]:
    base = root / "Results" / "oi" / cmd
    return {p.name for p in base.iterdir() if (p / "status.json").is_file()} if base.is_dir() else set()


def _mark_cancelled(root: Path, cmd: str, run_id: str) -> None:
    status = root / "Results" / "oi" / cmd / run_id / "status.json"
    try:
        data = json.loads(status.read_text())
        if data.get("state") == "running":
            status.write_text(json.dumps({**data, "state": "cancelled", "updated": now()}, ensure_ascii=False))
    except (OSError, ValueError):
        pass


def _interrupt(*_):
    raise KeyboardInterrupt  # SIGTERM (nút Dừng) đi cùng đường với Ctrl+C


def run_job(job_dir: Path) -> int:
    root = job_dir.parents[2]  # <Datasets>/Results/runner/<id>
    job = json.loads((job_dir / "job.json").read_text())
    job.update(state="running", pid=os.getpid(), started=now())
    write_job(job_dir, job)
    signal.signal(signal.SIGTERM, _interrupt)
    names: dict[str, str] = {}
    env = {**os.environ, "TNG_DATASETS": str(root)}
    with open(job_dir / "log.txt", "a", encoding="utf-8") as log:
        for i, step in enumerate(job["steps"]):
            cmd = step["cmd"]
            job["current"] = i
            step.update(state="running", started=now())
            write_job(job_dir, job)
            before = _run_ids(root, cmd)
            proc = None
            try:
                params = {k: substitute(v, names) for k, v in step.get("params", {}).items() if k != "data_root"}
                log.write(f"\n▶ [{i + 1}/{len(job['steps'])}] experiments {cmd} {json.dumps(params, ensure_ascii=False)}\n")
                log.flush()
                proc = subprocess.Popen([sys.executable, "-m", "experiments", *argv_for(cmd, params)],
                                        cwd=AI_ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
                code = proc.wait()
            except KeyboardInterrupt:
                if proc:
                    proc.terminate()
                    try:
                        proc.wait(15)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                for rid in _run_ids(root, cmd) - before:
                    _mark_cancelled(root, cmd, rid)
                log.write("✗ đã dừng (cancel)\n")
                step.update(state="cancelled", finished=now())
                job.update(state="cancelled", finished=now())
                write_job(job_dir, job)
                return 130
            except KeyError as exc:
                log.write(f"✗ {exc}\n")
                code = 2
            new = sorted(_run_ids(root, cmd) - before)
            if new:
                step["run_id"] = new[-1]
                if step.get("save_as"):
                    names[step["save_as"]] = new[-1]
            step.update(state="done" if code == 0 else "failed", returncode=code, finished=now())
            if code != 0:
                log.write(f"✗ bước {i + 1} lỗi (exit {code}) — dừng job\n")
                job.update(state="failed", finished=now())
                write_job(job_dir, job)
                return code
            write_job(job_dir, job)
    job.update(state="done", finished=now())
    write_job(job_dir, job)
    return 0


def new_job_dir(root: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    job_dir, n = root / "Results" / "runner" / stamp, 1
    while job_dir.exists():
        n += 1
        job_dir = root / "Results" / "runner" / f"{stamp}-{n}"
    job_dir.mkdir(parents=True)
    return job_dir


def describe() -> dict:
    from experiments import core
    from experiments.__main__ import registry

    reg = {n: v for n, v in registry().items() if n not in HIDDEN}
    commands = {
        n: {"help": h, "params": [p for p in core.params_schema(cls) if p["name"] != "data_root"]}
        for n, (cls, _, h) in reg.items()
    }
    commands["archive"] = {"help": "Lưu thủ công 1 run vào History/ (trống = latest)", "params": [
        {"name": "name", "type": "str", "default": "", "help": "Thí nghiệm", "choices": list(reg)},
        {"name": "run_id", "type": "str", "default": "", "help": "Run id (trống = latest)", "choices": None},
    ]}
    from experiments.core import DEFAULT_DATA_ROOT

    return {"commands": commands, "presets": PRESETS, "models": model_catalog(Path(DEFAULT_DATA_ROOT)),
            "model_params": MODEL_PARAMS, "suite": {"steps": SUITE_STEPS, "defaults": SUITE_DEFAULT, "model_keys": SUITE_MODEL_KEYS}}


def main(argv: list[str]) -> int:
    if argv[:1] == ["describe"]:
        print(json.dumps(describe(), ensure_ascii=False, default=str))
        return 0
    if argv[:1] == ["plan"] and len(argv) == 2:  # tuỳ chọn suite (JSON) → các bước
        print(json.dumps(build_suite(json.loads(argv[1])), ensure_ascii=False))
        return 0
    if argv[:1] == ["run"] and len(argv) == 2:
        return run_job(Path(argv[1]))
    if argv[:1] == ["preset"] and len(argv) == 2 and argv[1] in PRESETS:
        from experiments.core import DEFAULT_DATA_ROOT

        job_dir = new_job_dir(Path(DEFAULT_DATA_ROOT))
        preset = PRESETS[argv[1]]
        write_job(job_dir, {"id": job_dir.name, "label": preset["label"], "created": now(), "state": "queued",
                            "steps": preset["steps"]})
        print(f"job {job_dir.name} → {job_dir}/log.txt")
        return run_job(job_dir)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
