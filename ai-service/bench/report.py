"""Gộp các CSV trong bench/results/ thành bảng so sánh cho thesis (Markdown / LaTeX).

Mỗi khoá (vd model × mode × device) lấy lần chạy MỚI NHẤT — chạy lại thì bảng
tự cập nhật. Bảng không có dữ liệu thì bỏ qua.

Usage (từ ai-service/):
    uv run python -m bench.report                    # → bench/results/REPORT.md
    uv run python -m bench.report --format latex     # → bench/results/REPORT.tex
    uv run python -m bench.report --lang en          # → REPORT.en.md (bản tiếng Anh cho luận văn)
    uv run python -m bench.report --lang en --format latex   # → REPORT.en.tex
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

from bench.common import RESULTS_DIR, utc_now
from bench.published import yolo_published
from bench.report_i18n import DOC, translate_table


def read_latest(name: str, key: tuple[str, ...]) -> list[dict]:
    path = RESULTS_DIR / name
    if not path.exists():
        return []
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    latest: dict[tuple, dict] = {}
    for row in sorted(rows, key=lambda r: r.get("timestamp", "")):
        latest[tuple(row.get(k, "") for k in key)] = row
    return list(latest.values())


def num(value, digits: int = 1) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "–"


def signed(value) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "–"
    return f"{v:+.1f}"


def family_order(model: str) -> tuple:
    family = 0 if model.startswith("yolov10") else 1
    return family, "nsmblx".find(model[-1]) if model[-1] in "nsmblx" else 9


# ── Bảng ──────────────────────────────────────────────────────────────────
def table_yolo_reproduction(rows: list[dict], family: str, title: str, note: str):
    rows = [r for r in rows if r["model"].startswith(family) and r.get("images") == "5000"]
    if not rows:
        return None
    rows.sort(key=lambda r: (family_order(r["model"]), r["mode"], r["device"]))
    body = [
        [
            r["model"],
            "NMS-free (e2e)" if r["mode"] == "e2e" else "one-to-many + NMS",
            r["device"],
            num(r["published_map50_95"]),
            num(r["coco_map50_95"] or r["ultra_map50_95"]),
            signed(r["delta_vs_published"]),
            num(r["ultra_map50_95"]),
        ]
        for r in rows
    ]
    header = ["Model", "Head", "Device", "AP (công bố)", "AP (của tôi, pycocotools)", "Δ", "AP (Ultralytics)"]
    return title, note, header, body


def table_yolo_compare(val_rows: list[dict], latency_rows: list[dict]):
    val = {(r["model"], r["mode"]): r for r in val_rows if r.get("images") == "5000" and r["device"] == "mps"}
    lat = {(r["model"], r["mode"]): r for r in latency_rows if r["device"] == "mps"}
    models = sorted({m for m, _ in val} | {m for m, _ in lat}, key=family_order)
    if not models:
        return None
    body = []
    for model in models:
        reference, _ = yolo_published(model)
        e2e, nms = val.get((model, "e2e"), {}), val.get((model, "nms"), {})
        le2e, lnms = lat.get((model, "e2e"), {}), lat.get((model, "nms"), {})
        body.append([
            model,
            num((reference or {}).get("params_m")),
            num(e2e.get("coco_map50_95") or e2e.get("ultra_map50_95")),
            num(nms.get("coco_map50_95") or nms.get("ultra_map50_95")),
            num(le2e.get("model_mean_ms"), 2),
            num(lnms.get("model_mean_ms"), 2),
        ])
    header = ["Model", "Params (M)", "AP e2e", "AP + NMS", "Latency e2e (ms)", "Latency + NMS (ms)"]
    note = ("Cùng máy, cùng protocol: COCO val2017 5000 ảnh, 640 px; latency = inference + "
            "hậu xử lý, batch 1, MPS (bench/yolo_latency.py).")
    return "YOLOv10 vs YOLO26 (đo trên máy này)", note, header, body


def table_yolo_latency(rows: list[dict]):
    if not rows:
        return None
    by_key = {(r["model"], r["device"], r["mode"]): r for r in rows}
    pairs = sorted({(m, d) for m, d, _ in by_key}, key=lambda p: (family_order(p[0]), p[1]))
    body = []
    for model, device in pairs:
        e2e, nms = by_key.get((model, device, "e2e"), {}), by_key.get((model, device, "nms"), {})
        speedup = "–"
        try:
            speedup = f"{float(nms['model_mean_ms']) / float(e2e['model_mean_ms']):.2f}×"
        except (KeyError, ValueError, ZeroDivisionError):
            pass
        body.append([
            model, device,
            num(e2e.get("model_mean_ms"), 2), num(e2e.get("model_p95_ms"), 2),
            num(nms.get("model_mean_ms"), 2), num(nms.get("model_p95_ms"), 2),
            speedup,
            num((e2e or nms).get("published_latency_ms"), 2),
        ])
    header = ["Model", "Device", "e2e mean", "e2e p95", "NMS mean", "NMS p95", "NMS / e2e", "Công bố (T4 TRT)"]
    note = ("Latency end-to-end batch 1 (ms), 640 px, conf 0.25. Cột công bố đo trên T4 TensorRT FP16 — "
            "khác phần cứng, chỉ dùng để đối chiếu tỉ lệ.")
    return "Latency: NMS-free vs NMS (luận điểm chính của YOLOv10)", note, header, body


def table_yolo_export(rows: list[dict]):
    if not rows:
        return None
    rows.sort(key=lambda r: (family_order(r["model"]), r["mode"], r["format"]))
    body = [
        [
            r["model"], r["format"], r["mode"], r["images"],
            num(r["map50_95"]), num(r["inference_ms"], 2), num(r["fps"]), num(r["size_mb"]),
            num(r.get("published_cpu_onnx_ms"), 1) if r["format"] == "onnx" else "–",
            r["status"],
        ]
        for r in rows
    ]
    header = ["Model", "Format", "Head", "Ảnh", "mAP50-95", "ms/ảnh", "FPS", "MB", "Công bố CPU ONNX (ms)", "Status"]
    note = "Ultralytics benchmark() (batch 1). mAP chỉ so được với số công bố khi chạy đủ 5000 ảnh."
    return "Ultralytics benchmark theo định dạng export", note, header, body


def table_clip_retrieval(rows: list[dict]):
    if not rows:
        return None
    rows.sort(key=lambda r: (r["dataset"], r["model"], r["pretrained"], r["caption_prefix"], r["image_preprocess"]))
    body = []
    for r in rows:
        body.append([
            f"{r['model']} / {r['pretrained']}", r["dataset"], r["caption_prefix"], r["image_preprocess"],
            "/".join(num(r[f"t2i_R@{k}"]) for k in (1, 5, 10)),
            "/".join(num(r[f"i2t_R@{k}"]) for k in (1, 5, 10)),
            "/".join(num(r.get(f"published_t2i_R@{k}")) for k in (1, 5, 10)) if r.get("published_t2i_R@1") else "–",
            "/".join(num(r.get(f"published_i2t_R@{k}")) for k in (1, 5, 10)) if r.get("published_i2t_R@1") else "–",
        ])
    header = ["Model", "Dataset", "Caption prefix", "Ảnh", "T→I R@1/5/10", "I→T R@1/5/10",
              "Paper T→I", "Paper I→T"]
    note = ("Zero-shot retrieval (CLIP paper Table 13: ViT-L/14@336px, caption có tiền tố "
            "\"a photo of\"). Ảnh = raw (gốc) hoặc backend (giả lập pipeline app).")
    return "CLIP zero-shot retrieval", note, header, body


def table_clip_zeroshot(rows: list[dict]):
    if not rows:
        return None
    rows.sort(key=lambda r: (r["dataset"], r["model"], r["pretrained"], r["prompts"], r["image_preprocess"]))
    body = [
        [
            f"{r['model']} / {r['pretrained']}", r["dataset"], f"{r['prompts']} ({r['n_templates']})",
            r["image_preprocess"], num(r["top1"]), num(r["top5"]), num(r["published_top1"]), signed(r["delta_top1"]),
        ]
        for r in rows
    ]
    header = ["Model", "Dataset", "Prompts", "Ảnh", "Top-1", "Top-5", "Paper Top-1", "Δ"]
    note = "Zero-shot classification (CLIP paper Table 11, prompt ensembling). Δ chỉ tính cho prompts=ensemble."
    return "CLIP zero-shot classification", note, header, body


DINO_ORDER = ["dinov3-vits16", "dinov3-vits16plus", "dinov3-vitb16", "dinov3-vitl16",
              "dinov2-small", "dinov2reg-small", "dinov2-base", "dinov2reg-base", "dinov2-large", "clip-app"]


def table_dino_retrieval(rows: list[dict]):
    if not rows:
        return None
    order = {m: i for i, m in enumerate(DINO_ORDER)}
    rows.sort(key=lambda r: (r["dataset"], order.get(r["model"], 99), r["preprocess"], r["query_crop"]))
    body = [
        [
            r["model"], r["size"], num(r["params_m"]), r["dataset"], r["preprocess"], r["query_crop"],
            f"{num(r['mAP_E'])}/{num(r['mAP_M'])}/{num(r['mAP_H'])}",
            num(r["published_mAP_H"]), signed(r["delta_mAP_H"]),
            num(r["img_per_s"]), num(r.get("latency_model_ms"), 1),
        ]
        for r in rows
    ]
    header = ["Model", "Size", "Params (M)", "Dataset", "Ảnh", "Query", "mAP E/M/H",
              "Paper H", "Δ H", "Ảnh/s", "Latency b1 (ms)"]
    note = ("Instance retrieval, CLS token + cosine (DINOv3 paper Table 14, cột Ox.-H; App. D.8: cạnh lớn "
            "224 px + đệm đen 224×224). Δ chỉ tính cho preprocess=pad224 (cả hai cách crop query). square224/app = đường đi ảnh "
            "của app; clip-app = CLIP của semantic search (không có số công bố).")
    return "Tái lập DINOv3 — Revisited Oxford/Paris", note, header, body


CLS_ORDER = ["zs_clip", "yolo_rule", "lp_yolo", "lp_clip", "lp_dino", "lp_clip_dino", "lp_all",
             "yolo26n_cls_ft", "system:zs_clip", "system:best", "system:lp_all"]
CLS_TAG_VI = {"portrait": "Chân dung", "group": "Nhóm người", "pets": "Thú cưng", "animals": "Động vật",
              "food": "Đồ ăn", "vehicles": "Phương tiện", "sports": "Thể thao", "beach": "Biển",
              "mountain": "Núi", "nature": "Thiên nhiên", "street": "Đường phố",
              "architecture": "Kiến trúc", "indoor": "Trong nhà", "night": "Ban đêm",
              "sunset": "Hoàng hôn", "event": "Sự kiện", "document": "Tài liệu"}


def _cls_sort(r: dict) -> int:
    return CLS_ORDER.index(r["config"]) if r["config"] in CLS_ORDER else 99


def with_ci(r: dict, key: str) -> str:
    """"87.4 [85.5–89.3]" nếu có CI bootstrap, không thì chỉ số."""
    lo, hi = r.get(f"{key}_ci_lo"), r.get(f"{key}_ci_hi")
    return f"{num(r.get(key))} [{num(lo)}–{num(hi)}]" if lo not in (None, "") else num(r.get(key))


def table_cls_t1(rows: list[dict]):
    rows = sorted((r for r in rows if r["task"] == "T1"), key=_cls_sort)
    if not rows:
        return None
    body = [[r["config"], r["features"], r["n_train"], r["n_test"], with_ci(r, "top1"), num(r["top2"]),
             with_ci(r, "macro_f1"), num(r["ece"]), num(r.get("val_score")), num(r.get("fit_s"), 1),
             num(r.get("classifier_ms_per_image"), 3), num(r.get("feature_ms_per_image"), 1)]
            for r in rows]
    header = ["Cấu hình", "Feature", "Train", "Test", "Top-1 [95% CI]", "Top-2", "Macro-F1 [95% CI]",
              "ECE ↓", "Val macro-F1", "Train (s)", "Classifier ms/ảnh", "Feature ms/ảnh"]
    note = ("T1 — phân loại cảnh 1 nhãn, Places365 val gom về 6 tag cảnh (chia 60/20/20 cố định). "
            "zs = zero-shot, lp = linear probe trên feature đóng băng, yolo26n_cls_ft = fine-tune toàn mạng. "
            "CI = bootstrap 1000 lần trên ảnh test: hai cấu hình có CI không chồng nhau mới chắc chắn khác nhau. "
            "Feature ms = thời gian model trích feature (app đã tính sẵn lúc upload).")
    return "Classification T1 — cảnh (Places6)", note, header, body


def table_cls_t2(rows: list[dict]):
    rows = sorted((r for r in rows if r["task"] in ("T2", "system")), key=lambda r: (r["dataset"], _cls_sort(r)))
    if not rows:
        return None
    body = [[r["dataset"], r["config"], r["features"], r["n_train"], r["n_test"], with_ci(r, "mAP"),
             with_ci(r, "macro_f1"), num(r["micro_f1"]), num(r["ece"]), num(r.get("val_score")),
             r.get("parts", "")] for r in rows]
    header = ["Dataset", "Cấu hình", "Feature", "Train", "Test", "mAP [95% CI]", "Macro-F1 [95% CI]",
              "Micro-F1", "ECE ↓", "Val mAP", "Thành phần (system)"]
    note = ("T2 — gắn tag nhiều nhãn: COCO val2017 → 7 tag đối tượng (nhãn suy từ annotation; yolo_rule "
            "dùng cùng luật nên có lợi thế trên COCO). gallery = hệ thống 17 tag trên ảnh đã duyệt; "
            "system:best = mỗi nhóm tag dùng cấu hình có điểm val cao nhất. F1 tại ngưỡng / tag chọn trên val.")
    return "Classification T2 — gắn tag nhiều nhãn", note, header, body


def table_cls_per_tag(rows: list[dict], dataset: str, title: str):
    """Tag × cấu hình: F1 (và AP nếu nhiều nhãn); cột cuối = cấu hình F1 cao nhất."""
    rows = [r for r in rows if r["dataset"] == dataset]
    if not rows:
        return None
    configs = sorted({r["config"] for r in rows}, key=lambda c: CLS_ORDER.index(c) if c in CLS_ORDER else 99)
    tags = list(dict.fromkeys(r["tag"] for r in rows))
    cell = {(r["tag"], r["config"]): r for r in rows}
    multi = any(r.get("AP") not in ("", "nan", None) for r in rows)
    body = []
    for tag in tags:
        line = [CLS_TAG_VI.get(tag, tag), cell[(tag, configs[0])]["support"]]
        f1s = {}
        for c in configs:
            r = cell.get((tag, c))
            if not r:
                line.append("–")
                continue
            f1s[c] = float(r["f1"])
            line.append(f"{100 * float(r['f1']):.0f}" + (f" / {100 * float(r['AP']):.0f}" if multi and r["AP"] not in ("", "nan") else ""))
        line.append(max(f1s, key=f1s.get) if f1s else "–")
        body.append(line)
    header = ["Tag", "Ảnh test", *configs, "Tốt nhất (F1)"]
    note = ("F1 / AP (%) theo từng tag trên tập test" if multi else "F1 (%) theo từng tag trên tập test") + \
           ". Dùng để xem mỗi model mạnh ở loại tag nào."
    return title, note, header, body


def table_cls_confusion(rows: list[dict], conf_rows: list[dict]):
    """Ma trận nhầm lẫn T1 của cấu hình có top-1 cao nhất (hàng = nhãn thật, cột = dự đoán)."""
    t1 = [r for r in rows if r["task"] == "T1"]
    if not t1 or not conf_rows:
        return None
    best = max(t1, key=lambda r: float(r["top1"]))["config"]
    cells = {(r["true"], r["pred"]): int(r["count"]) for r in conf_rows if r["config"] == best}
    if not cells:
        return None
    tags = list(dict.fromkeys(r["true"] for r in conf_rows if r["config"] == best))
    body = []
    for t in tags:
        total = sum(cells.get((t, p), 0) for p in tags) or 1
        body.append([CLS_TAG_VI.get(t, t), *[f"{100 * cells.get((t, p), 0) / total:.0f}" for p in tags], total])
    header = ["Thật \\ Dự đoán", *[CLS_TAG_VI.get(t, t) for t in tags], "Số ảnh"]
    note = (f"Ma trận nhầm lẫn T1 (% theo hàng) của cấu hình tốt nhất `{best}`. Đường chéo = recall; "
            "ô ngoài đường chéo lớn = cặp cảnh hay bị nhầm.")
    return f"Classification T1 — ma trận nhầm lẫn ({best})", note, header, body


# ── Render ────────────────────────────────────────────────────────────────
def render_markdown(tables, lang: str = "vi") -> str:
    doc = DOC[lang]
    out = [f"# {doc['title']}\n\n_{doc['generated'].format(now=utc_now())}_\n"]
    for title, note, header, body in tables:
        out.append(f"\n## {title}\n\n{note}\n")
        out.append("| " + " | ".join(header) + " |")
        out.append("|" + "|".join("---" for _ in header) + "|")
        out.extend("| " + " | ".join(str(c) for c in row) + " |" for row in body)
    return "\n".join(out) + "\n"


def _tex(text: str) -> str:
    for a, b in [("\\", r"\textbackslash{}"), ("&", r"\&"), ("%", r"\%"), ("_", r"\_"),
                 ("#", r"\#"), ("Δ", r"$\Delta$"), ("×", r"$\times$"), ("→", r"$\rightarrow$")]:
        text = text.replace(a, b)
    return text


def render_latex(tables, lang: str = "vi") -> str:
    out = ["% " + DOC[lang]["tex_generated"].format(now=utc_now())]
    for title, note, header, body in tables:
        out += [
            "\\begin{table}[ht]", "\\centering", "\\small",
            f"\\caption{{{_tex(title)}. {_tex(note)}}}",
            "\\begin{tabular}{" + "l" * len(header) + "}", "\\toprule",
            " & ".join(_tex(h) for h in header) + " \\\\", "\\midrule",
            *(" & ".join(_tex(str(c)) for c in row) + " \\\\" for row in body),
            "\\bottomrule", "\\end{tabular}", "\\end{table}", "",
        ]
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bảng tổng hợp benchmark cho thesis.")
    parser.add_argument("--format", choices=["markdown", "latex"], default="markdown")
    parser.add_argument("--lang", choices=["vi", "en"], default="vi",
                        help="vi (mặc định) | en — bản tiếng Anh cho luận văn (REPORT.en.*)")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    val_rows = read_latest("yolo_coco_val2017.csv", ("model", "mode", "device", "images"))
    latency_rows = read_latest("yolo_latency.csv", ("model", "mode", "device"))
    export_rows = read_latest("yolo_export_benchmark.csv", ("model", "format", "mode", "images"))
    retrieval_rows = read_latest(
        "clip_retrieval.csv", ("model", "pretrained", "dataset", "caption_prefix", "image_preprocess")
    )
    zeroshot_rows = read_latest("clip_zeroshot.csv", ("model", "pretrained", "dataset", "prompts", "image_preprocess"))
    dino_rows = read_latest("dino_retrieval.csv", ("model", "dataset", "preprocess", "query_crop", "queries"))
    cls_rows = read_latest("cls_eval.csv", ("task", "dataset", "config", "image_preprocess"))
    cls_tag_rows = read_latest("cls_eval_per_tag.csv", ("dataset", "config", "tag"))
    cls_conf_rows = read_latest("cls_confusion.csv", ("dataset", "config", "true", "pred"))

    tables = [
        table_yolo_reproduction(
            val_rows, "yolov10", "Tái lập YOLOv10 (paper Table 1) — COCO val2017",
            "AP50-95 (%). Paper: AP chính = NMS-free, AP† = one-to-many + NMS.",
        ),
        table_yolo_reproduction(
            val_rows, "yolo26", "Tái lập YOLO26 (Ultralytics docs) — COCO val2017",
            "AP50-95 (%). Docs: cột mAPval 50-95 = + NMS, cột (e2e) = NMS-free.",
        ),
        table_yolo_compare(val_rows, latency_rows),
        table_yolo_latency(latency_rows),
        table_yolo_export(export_rows),
        table_clip_retrieval(retrieval_rows),
        table_clip_zeroshot(zeroshot_rows),
        table_dino_retrieval(dino_rows),
        table_cls_t1(cls_rows),
        table_cls_confusion(cls_rows, cls_conf_rows),
        table_cls_per_tag(cls_tag_rows, "places6", "Classification T1 — theo từng tag cảnh"),
        table_cls_t2(cls_rows),
        table_cls_per_tag(cls_tag_rows, "coco", "Classification T2 — theo từng tag đối tượng"),
        table_cls_per_tag(cls_tag_rows, "gallery", "Hệ thống 17 tag — theo từng tag (gallery)"),
    ]
    tables = [t for t in tables if t]
    if not tables:
        print(f"Chưa có kết quả trong {RESULTS_DIR} — chạy các script bench trước.")
        return 1

    tables = [translate_table(t, args.lang) for t in tables]
    text = render_latex(tables, args.lang) if args.format == "latex" else render_markdown(tables, args.lang)
    suffix = "" if args.lang == "vi" else f".{args.lang}"
    out = args.out or RESULTS_DIR / f"REPORT{suffix}.{'tex' if args.format == 'latex' else 'md'}"
    out.write_text(text)
    print(f"{len(tables)} bảng → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
