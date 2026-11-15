"""Sinh mục `labels` (174 nhãn chi tiết) trong từ điển search của backend.

Nguồn: app/tagging/labels.csv (tên en/vi/ja) + experiments/data/oi_classes.csv (cột
`coco`): nhãn trùng lớp COCO được chép thêm mọi cách gọi của vật thể đó trong từ
điển ("cún", "puppy", "イヌ"…). Ghi đè đúng mục `labels`, giữ nguyên phần còn lại.
Chạy lại sau khi sửa labels.csv:

    uv run python scripts/sync_search_lexicon.py           # ghi file
    uv run python scripts/sync_search_lexicon.py --check   # chỉ kiểm tra đã đồng bộ (CI / test)
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.tagging.labels import LABEL_PREFIX, label_catalog  # noqa: E402

LEXICON_FILE = SERVICE_ROOT.parent / "backend" / "src" / "modules" / "ai" / "search.lexicon.json"
OI_CLASSES = SERVICE_ROOT / "experiments" / "data" / "oi_classes.csv"


def variants(name: str) -> list[str]:
    """"Ô (dù)" → ["ô", "dù"]; "Ball (Object)" → ["ball"]; bỏ tên có "&"."""
    if "&" in name:
        return []
    out = []
    main = re.sub(r"\s*\(.*?\)\s*", " ", name).strip()
    inner = re.findall(r"\((.*?)\)", name)
    for v in [main, *inner]:
        v = v.strip().lower()
        if v and v not in ("object", "fruit", "drink", "structure") and v not in out:
            out.append(v)
    return out


def build_labels(lexicon: dict) -> dict:
    with OI_CLASSES.open(encoding="utf-8") as f:
        coco = {r["oi_name"]: r["coco"] for r in csv.DictReader(line for line in f if not line.startswith("#"))}
    labels = {}
    for row in label_catalog():
        names = {lang: [] for lang in ("vi", "en", "ja")}
        for lang in names:
            for v in variants(row[lang]):
                names[lang].append(v)
        for v in variants(row["oi_name"]):
            if v not in names["en"]:
                names["en"].append(v)
        obj = lexicon["objects"].get(coco.get(row["oi_name"]) or "")
        if obj:
            for lang in names:
                for v in obj.get(lang, []):
                    if v.lower() not in names[lang]:
                        names[lang].append(v.lower())
        labels[LABEL_PREFIX + row["id"]] = names
    return labels


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="Không ghi, trả mã lỗi nếu chưa đồng bộ.")
    args = parser.parse_args()
    lexicon = json.loads(LEXICON_FILE.read_text(encoding="utf-8"))
    labels = build_labels(lexicon)
    if args.check:
        ok = lexicon.get("labels") == labels
        print("lexicon labels: OK" if ok else "lexicon labels: KHÁC labels.csv — chạy scripts/sync_search_lexicon.py")
        return 0 if ok else 1
    lexicon["labels"] = labels
    LEXICON_FILE.write_text(json.dumps(lexicon, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {LEXICON_FILE} · {len(labels)} nhãn")
    return 0


if __name__ == "__main__":
    sys.exit(main())
