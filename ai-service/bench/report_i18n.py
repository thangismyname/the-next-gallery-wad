"""Bản tiếng Anh cho bench/report.py (`--lang en`) — luận văn viết bằng tiếng Anh.

report.py dựng bảng bằng tiếng Việt; `translate_table` thay từng chuỗi (tiêu đề, ghi
chú, header, ô) bằng bản tiếng Anh. Chuỗi khớp NGUYÊN VĂN trong EXACT; chuỗi có phần
động (tên cấu hình…) dùng PATTERNS. Chuỗi chưa có bản dịch giữ nguyên — thêm bảng mới
vào report.py thì thêm bản dịch tương ứng ở đây.
"""
from __future__ import annotations

import re

EXACT = {
    # ── YOLO ──────────────────────────────────────────────────────────────
    "Tái lập YOLOv10 (paper Table 1) — COCO val2017": "YOLOv10 reproduction (paper Table 1) — COCO val2017",
    "AP50-95 (%). Paper: AP chính = NMS-free, AP† = one-to-many + NMS.":
        "AP50-95 (%). Paper: main AP = NMS-free, AP† = one-to-many head + NMS.",
    "Tái lập YOLO26 (Ultralytics docs) — COCO val2017": "YOLO26 reproduction (Ultralytics docs) — COCO val2017",
    "AP50-95 (%). Docs: cột mAPval 50-95 = + NMS, cột (e2e) = NMS-free.":
        "AP50-95 (%). Docs: column mAPval 50-95 = with NMS, column (e2e) = NMS-free.",
    "AP (công bố)": "AP (published)",
    "AP (của tôi, pycocotools)": "AP (ours, pycocotools)",
    "YOLOv10 vs YOLO26 (đo trên máy này)": "YOLOv10 vs YOLO26 (measured on this machine)",
    "Cùng máy, cùng protocol: COCO val2017 5000 ảnh, 640 px; latency = inference + hậu xử lý, batch 1, MPS (bench/yolo_latency.py).":
        "Same machine, same protocol: COCO val2017, 5000 images, 640 px; latency = inference + "
        "post-processing, batch 1, MPS (bench/yolo_latency.py).",
    "Công bố (T4 TRT)": "Published (T4 TRT)",
    "Latency end-to-end batch 1 (ms), 640 px, conf 0.25. Cột công bố đo trên T4 TensorRT FP16 — khác phần cứng, chỉ dùng để đối chiếu tỉ lệ.":
        "End-to-end latency, batch 1 (ms), 640 px, conf 0.25. The published column is T4 TensorRT FP16 — "
        "different hardware, compare ratios only.",
    "Latency: NMS-free vs NMS (luận điểm chính của YOLOv10)": "Latency: NMS-free vs NMS (YOLOv10's main claim)",
    "Ảnh": "Images",
    "ms/ảnh": "ms/image",
    "Công bố CPU ONNX (ms)": "Published CPU ONNX (ms)",
    "Ultralytics benchmark() (batch 1). mAP chỉ so được với số công bố khi chạy đủ 5000 ảnh.":
        "Ultralytics benchmark() (batch 1). mAP is comparable with published numbers only on all 5000 images.",
    "Ultralytics benchmark theo định dạng export": "Ultralytics benchmark per export format",
    # ── CLIP ──────────────────────────────────────────────────────────────
    "Zero-shot retrieval (CLIP paper Table 13: ViT-L/14@336px, caption có tiền tố \"a photo of\"). Ảnh = raw (gốc) hoặc backend (giả lập pipeline app).":
        "Zero-shot retrieval (CLIP paper Table 13: ViT-L/14@336px, captions prefixed with \"a photo of\"). "
        "Images = raw (original) or backend (simulated app pipeline).",
    "Zero-shot classification (CLIP paper Table 11, prompt ensembling). Δ chỉ tính cho prompts=ensemble.":
        "Zero-shot classification (CLIP paper Table 11, prompt ensembling). Δ only for prompts=ensemble.",
    # ── DINOv3 ────────────────────────────────────────────────────────────
    "Ảnh/s": "Images/s",
    "Instance retrieval, CLS token + cosine (DINOv3 paper Table 14, cột Ox.-H; App. D.8: cạnh lớn 224 px + đệm đen 224×224). Δ chỉ tính cho preprocess=pad224 (cả hai cách crop query). square224/app = đường đi ảnh của app; clip-app = CLIP của semantic search (không có số công bố).":
        "Instance retrieval, CLS token + cosine (DINOv3 paper Table 14, column Ox.-H; App. D.8: longer side "
        "224 px, black-padded to 224×224). Δ only for preprocess=pad224 (both query crops). square224/app = "
        "the app's image path; clip-app = the CLIP model used for semantic search (no published number).",
    "Tái lập DINOv3 — Revisited Oxford/Paris": "DINOv3 reproduction — Revisited Oxford/Paris",
    # ── Classification ────────────────────────────────────────────────────
    "Cấu hình": "Configuration",
    "image (fine-tune toàn mạng)": "image (full fine-tuning)",
    "Train (s)": "Train (s)",
    "Classifier ms/ảnh": "Classifier ms/image",
    "Feature ms/ảnh": "Feature ms/image",
    "T1 — phân loại cảnh 1 nhãn, Places365 val gom về 6 tag cảnh (chia 60/20/20 cố định). zs = zero-shot, lp = linear probe trên feature đóng băng, yolo26n_cls_ft = fine-tune toàn mạng. CI = bootstrap 1000 lần trên ảnh test: hai cấu hình có CI không chồng nhau mới chắc chắn khác nhau. Feature ms = thời gian model trích feature (app đã tính sẵn lúc upload).":
        "T1 — single-label scene classification: Places365 val mapped to 6 scene tags (fixed 60/20/20 split). "
        "zs = zero-shot, lp = linear probe on frozen features, yolo26n_cls_ft = full-network fine-tuning. "
        "CI = 1000-sample bootstrap over test images: two configurations differ significantly only if their "
        "CIs do not overlap. Feature ms = feature extraction time (already computed by the app at upload).",
    "Classification T1 — cảnh (Places6)": "Classification T1 — scenes (Places6)",
    "Thành phần (system)": "Components (system)",
    "T2 — gắn tag nhiều nhãn: COCO val2017 → 7 tag đối tượng (nhãn suy từ annotation; yolo_rule dùng cùng luật nên có lợi thế trên COCO). gallery = hệ thống 17 tag trên ảnh đã duyệt; system:best = mỗi nhóm tag dùng cấu hình có điểm val cao nhất. F1 tại ngưỡng / tag chọn trên val.":
        "T2 — multi-label tagging: COCO val2017 → 7 object tags (labels derived from annotations; yolo_rule "
        "uses the same rule, hence its advantage on COCO). gallery = full 17-tag system on reviewed photos; "
        "system:best = each tag group uses the configuration with the highest validation score. "
        "F1 at per-tag thresholds selected on validation.",
    "Classification T2 — gắn tag nhiều nhãn": "Classification T2 — multi-label tagging",
    "Ảnh test": "Test images",
    "Tốt nhất (F1)": "Best (F1)",
    "F1 / AP (%) theo từng tag trên tập test. Dùng để xem mỗi model mạnh ở loại tag nào.":
        "Per-tag F1 / AP (%) on the test split — shows which model is strong on which kind of tag.",
    "F1 (%) theo từng tag trên tập test. Dùng để xem mỗi model mạnh ở loại tag nào.":
        "Per-tag F1 (%) on the test split — shows which model is strong on which kind of tag.",
    "Classification T1 — theo từng tag cảnh": "Classification T1 — per scene tag",
    "Classification T2 — theo từng tag đối tượng": "Classification T2 — per object tag",
    "Hệ thống 17 tag — theo từng tag (gallery)": "17-tag system — per tag (gallery)",
    "Thật \\ Dự đoán": "True \\ Predicted",
    "Số ảnh": "Images",
    # Tag
    "Chân dung": "Portrait", "Nhóm người": "Group", "Thú cưng": "Pets", "Động vật": "Animals",
    "Đồ ăn": "Food", "Phương tiện": "Vehicles", "Thể thao": "Sports", "Biển": "Beach & sea",
    "Núi": "Mountains", "Thiên nhiên": "Nature", "Đường phố": "Street & city",
    "Kiến trúc": "Architecture", "Trong nhà": "Indoor", "Ban đêm": "Night",
    "Hoàng hôn": "Sunset", "Sự kiện": "Event", "Tài liệu": "Document",
}

PATTERNS = [
    (re.compile(r"^Ma trận nhầm lẫn T1 \(% theo hàng\) của cấu hình tốt nhất `(.+)`\. Đường chéo = recall; "
                r"ô ngoài đường chéo lớn = cặp cảnh hay bị nhầm\.$"),
     r"T1 confusion matrix (row-normalised %) of the best configuration `\1`. Diagonal = recall; "
     r"large off-diagonal cells = scene pairs that are often confused."),
    (re.compile(r"^Classification T1 — ma trận nhầm lẫn \((.+)\)$"), r"Classification T1 — confusion matrix (\1)"),
]

DOC = {
    "vi": {"title": "Benchmark report", "generated": "Sinh tự động bởi `bench/report.py` lúc {now}.",
           "tex_generated": "Sinh tự động bởi bench/report.py lúc {now} — cần \\usepackage{{booktabs}}"},
    "en": {"title": "Benchmark report", "generated": "Generated by `bench/report.py` at {now}.",
           "tex_generated": "Generated by bench/report.py at {now} — requires \\usepackage{{booktabs}}"},
}


def tr(text):
    if not isinstance(text, str):
        return text
    if text in EXACT:
        return EXACT[text]
    for pattern, repl in PATTERNS:
        if pattern.match(text):
            return pattern.sub(repl, text)
    return text


def translate_table(table, lang: str):
    if lang == "vi" or table is None:
        return table
    title, note, header, body = table
    return tr(title), tr(note), [tr(h) for h in header], [[tr(c) for c in row] for row in body]


def untranslated(tables) -> set[str]:
    """Chuỗi còn dấu tiếng Việt sau khi dịch — để test bắt bảng mới quên dịch."""
    vi = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)
    leftovers = set()
    for title, note, header, body in tables:
        for text in [title, note, *header, *(c for row in body for c in row)]:
            if isinstance(text, str) and vi.search(text):
                leftovers.add(text)
    return leftovers
