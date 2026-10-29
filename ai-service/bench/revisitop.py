"""Revisited Oxford / Paris (Radenović et al., CVPR 2018) — reader, kiểm tra dataset, mAP.

DINOv3 paper (Table 14, cột "Ox.-H") đánh giá instance retrieval trên
Revisited Oxford, protocol Hard. Layout dataset dưới `$TNG_DATASETS`:

    revisitop/
    ├── roxford5k/{jpg/*.jpg, gnd_roxford5k.pkl}   imlist 4993 ảnh (archive có 5063)
    └── rparis6k/{jpg/*.jpg, gnd_rparis6k.pkl}     imlist 6322 ảnh (archive có 6412)

`gnd_<ds>.pkl`: dict {imlist, qimlist, gnd}; gnd[i] = {bbx, easy, hard, junk}
(chỉ số trong imlist). Query (70 mỗi dataset) cũng là ảnh trong jpg/.

Protocol (revisitop): với mỗi query, ảnh positive/junk tuỳ mức độ
    Easy   : ok = easy,        junk = junk + hard
    Medium : ok = easy + hard, junk = junk
    Hard   : ok = hard,        junk = junk + easy
Junk bị loại khỏi ranking (không tính đúng, không tính sai) trước khi tính AP.

Kiểm tra / chuẩn hoá layout sau khi giải nén (từ ai-service/):
    uv run python -m bench.revisitop
"""
from __future__ import annotations

import argparse
import pickle
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from bench.common import DEFAULT_DATA_ROOT

DATASETS = {
    # Số ảnh database của bản Revisited (Radenović et al., CVPR 2018, Table 1) —
    # archive gốc nhiều file hơn, ảnh ngoài imlist bị bỏ qua.
    "roxford5k": {"images": 4993, "queries": 70},
    "rparis6k": {"images": 6322, "queries": 70},
}
PROTOCOLS = ("easy", "medium", "hard")
KAPPAS = (1, 5, 10)


def dataset_dir(data_root: Path, name: str) -> Path:
    return data_root.expanduser().resolve() / "revisitop" / name


@dataclass
class RevisitopData:
    name: str
    jpg_dir: Path
    imlist: list[str]
    qimlist: list[str]
    gnd: list[dict]

    def image_path(self, name: str) -> Path:
        return self.jpg_dir / f"{name}.jpg"


def load_revisitop(data_root: Path, name: str) -> RevisitopData:
    root = dataset_dir(data_root, name)
    gnd_file = root / f"gnd_{name}.pkl"
    if not gnd_file.exists():
        raise SystemExit(f"Thiếu {gnd_file} — xem bench/README.md (mục DINOv3).")
    with open(gnd_file, "rb") as fh:
        cfg = pickle.load(fh)
    data = RevisitopData(name, root / "jpg", list(cfg["imlist"]), list(cfg["qimlist"]), list(cfg["gnd"]))
    missing = [n for n in data.imlist if not data.image_path(n).exists()]
    if missing:
        raise SystemExit(
            f"{name}: thiếu {len(missing)}/{len(data.imlist)} ảnh trong {data.jpg_dir} "
            f"(vd {missing[0]}.jpg) — chạy `uv run python -m bench.revisitop` để kiểm tra."
        )
    return data


# ── Metric (theo định nghĩa revisitop) ─────────────────────────────────────
def average_precision(positive_ranks: np.ndarray, n_positives: int) -> float:
    """AP với nội suy hình thang giữa precision trước/sau mỗi positive.

    `positive_ranks`: vị trí (0-based, đã bỏ junk, tăng dần) của các positive.
    """
    ap = 0.0
    step = 1.0 / n_positives
    for j, rank in enumerate(positive_ranks):
        precision_before = 1.0 if rank == 0 else j / rank
        precision_after = (j + 1) / (rank + 1)
        ap += (precision_before + precision_after) * step / 2.0
    return ap


def protocol_sets(entry: dict, protocol: str) -> tuple[np.ndarray, np.ndarray]:
    easy = np.asarray(entry.get("easy", []), dtype=int)
    hard = np.asarray(entry.get("hard", []), dtype=int)
    junk = np.asarray(entry.get("junk", []), dtype=int)
    if protocol == "easy":
        return easy, np.concatenate([junk, hard])
    if protocol == "medium":
        return np.concatenate([easy, hard]), junk
    return hard, np.concatenate([junk, easy])


def evaluate(similarity: np.ndarray, gnd: list[dict], kappas=KAPPAS) -> dict[str, float]:
    """similarity (n_queries, n_db) → mAP + mP@k (%) cho Easy/Medium/Hard.

    Query không có positive ở 1 protocol bị bỏ khỏi trung bình protocol đó.
    """
    order = np.argsort(-similarity, axis=1, kind="stable")
    result: dict[str, float] = {}
    for protocol in PROTOCOLS:
        aps, precisions = [], []
        for qi, entry in enumerate(gnd):
            ok, junk = protocol_sets(entry, protocol)
            if ok.size == 0:
                continue
            ranking = order[qi]
            is_junk = np.isin(ranking, junk)
            clean = ranking[~is_junk]  # bỏ junk → dồn hạng các ảnh phía sau
            hits = np.isin(clean, ok)
            positive_ranks = np.flatnonzero(hits)
            aps.append(average_precision(positive_ranks, ok.size))
            precisions.append([hits[:k].sum() / k for k in kappas])
        short = protocol[0].upper()  # E / M / H
        result[f"mAP_{short}"] = round(100 * float(np.mean(aps)), 2) if aps else float("nan")
        mean_p = np.mean(precisions, axis=0) if precisions else [float("nan")] * len(kappas)
        for k, p in zip(kappas, mean_p):
            result[f"mP@{k}_{short}"] = round(100 * float(p), 2)
    return result


# ── Kiểm tra layout sau khi tải ───────────────────────────────────────────
def _flatten(jpg_dir: Path) -> int:
    """Paris giải nén ra paris/<landmark>/*.jpg → dồn hết lên jpg/ (như revisitop)."""
    moved = 0
    for path in list(jpg_dir.rglob("*.jpg")):
        if path.parent == jpg_dir:
            continue
        target = jpg_dir / path.name
        if not target.exists():
            shutil.move(str(path), target)
            moved += 1
    for sub in sorted((p for p in jpg_dir.rglob("*") if p.is_dir()), reverse=True):
        (sub / ".DS_Store").unlink(missing_ok=True)  # macOS Finder để lại
        if not any(sub.iterdir()):
            sub.rmdir()
    return moved


def _decode_check(data: RevisitopData) -> tuple[list[str], list[tuple[str, str]]]:
    """Giải mã thử mọi ảnh: (bị cắt cụt nhưng đọc được, không đọc được)."""
    from PIL import Image, ImageFile

    truncated, broken = [], []
    for name in data.imlist:
        path = data.image_path(name)
        try:
            ImageFile.LOAD_TRUNCATED_IMAGES = False
            with Image.open(path) as image:
                image.load()
        except OSError:
            try:
                ImageFile.LOAD_TRUNCATED_IMAGES = True
                with Image.open(path) as image:
                    image.load()
                truncated.append(name)
            except Exception as exc:  # noqa: BLE001
                broken.append((name, f"{type(exc).__name__}: {exc}"))
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = False
    return truncated, broken


def check(data_root: Path) -> bool:
    ok_all = True
    for name, expected in DATASETS.items():
        root = dataset_dir(data_root, name)
        jpg_dir = root / "jpg"
        gnd_file = root / f"gnd_{name}.pkl"
        print(f"\n[{name}] {root}")
        if not jpg_dir.exists() or not gnd_file.exists():
            print(f"  ✗ thiếu {'jpg/' if not jpg_dir.exists() else gnd_file.name}")
            ok_all = False
            continue
        moved = _flatten(jpg_dir)
        if moved:
            print(f"  · đã dồn {moved} ảnh từ thư mục con lên jpg/")
        try:
            data = load_revisitop(data_root, name)
        except SystemExit as exc:
            print(f"  ✗ {exc}")
            ok_all = False
            continue
        n_q = len(data.qimlist)
        print(f"  ✓ {len(data.imlist)} ảnh database (kỳ vọng {expected['images']}), {n_q} query")
        truncated, broken = _decode_check(data)
        for name in truncated:
            print(f"  ! {name}.jpg bị cắt cụt (thiếu byte cuối) — bench vẫn đọc được")
        for name, err in broken:
            print(f"  ✗ {name}.jpg không đọc được: {err}")
        ok_all &= not broken
        ok_all &= len(data.imlist) == expected["images"] and n_q == expected["queries"]
    return ok_all


def main() -> int:
    parser = argparse.ArgumentParser(description="Kiểm tra Revisited Oxford/Paris.")
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    args = parser.parse_args()
    return 0 if check(args.data_root) else 1


if __name__ == "__main__":
    raise SystemExit(main())
