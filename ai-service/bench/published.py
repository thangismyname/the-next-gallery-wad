"""Số liệu công bố dùng để so sánh — mỗi nhóm ghi rõ nguồn (bảng nào, paper nào).

Giá trị là phần trăm (mAP, accuracy, recall) hoặc mili-giây (latency).
Đã đối chiếu trực tiếp với paper / docs (2026-10-23).
"""
from __future__ import annotations

# ── YOLOv10 — Wang et al., "YOLOv10: Real-Time End-to-End Object Detection",
#    NeurIPS 2024 (arXiv:2405.14458v2), Table 1. COCO val2017, 640 px.
#    AP chính = NMS-free (head one-to-one) → mode "e2e" (Ultralytics `nms=False`).
#    AP† = huấn luyện one-to-many gốc + NMS → mode "nms".
#    Latency = end-to-end, T4 TensorRT FP16, batch 1; latency_forward = không hậu xử lý.
YOLOV10_SOURCE = "YOLOv10 paper (NeurIPS 2024) Table 1"
YOLOV10 = {
    "yolov10n": {"e2e": 38.5, "nms": 39.5, "params_m": 2.3, "flops_g": 6.7, "latency_ms": 1.84, "latency_forward_ms": 1.79},
    "yolov10s": {"e2e": 46.3, "nms": 46.8, "params_m": 7.2, "flops_g": 21.6, "latency_ms": 2.49, "latency_forward_ms": 2.39},
    "yolov10m": {"e2e": 51.1, "nms": 51.3, "params_m": 15.4, "flops_g": 59.1, "latency_ms": 4.74, "latency_forward_ms": 4.63},
    "yolov10b": {"e2e": 52.5, "nms": 52.7, "params_m": 19.1, "flops_g": 92.0, "latency_ms": 5.74, "latency_forward_ms": 5.67},
    "yolov10l": {"e2e": 53.2, "nms": 53.4, "params_m": 24.4, "flops_g": 120.3, "latency_ms": 7.28, "latency_forward_ms": 7.21},
    "yolov10x": {"e2e": 54.4, "nms": 54.4, "params_m": 29.5, "flops_g": 160.4, "latency_ms": 10.70, "latency_forward_ms": 10.60},
}

# ── YOLO26 — Ultralytics YOLO26 docs (model page + YOLO26-vs-YOLOv10 compare page).
#    COCO val2017, 640 px. "nms" = cột mAPval 50-95 (head one-to-many + NMS, mặc
#    định của `val`); "e2e" = cột mAPval 50-95(e2e) (`nms=False`).
#    Speed: CPU ONNX và T4 TensorRT10 (đo với head NMS-free theo docs).
YOLO26_SOURCE = "Ultralytics YOLO26 docs"
YOLO26 = {
    "yolo26n": {"nms": 40.9, "e2e": 40.1, "params_m": 2.4, "flops_g": 5.5, "cpu_onnx_ms": 38.9, "t4_trt_ms": 1.7},
    "yolo26s": {"nms": 48.6, "e2e": 47.8, "params_m": 9.5, "flops_g": 20.9, "cpu_onnx_ms": 87.2, "t4_trt_ms": 2.5},
    "yolo26m": {"nms": 53.1, "e2e": 52.5, "params_m": 20.4, "flops_g": 68.4, "cpu_onnx_ms": 220.0, "t4_trt_ms": 4.7},
    "yolo26l": {"nms": 55.0, "e2e": 54.4, "params_m": 24.8, "flops_g": 86.8, "cpu_onnx_ms": 286.2, "t4_trt_ms": 6.2},
    "yolo26x": {"nms": 57.5, "e2e": 56.9, "params_m": 55.7, "flops_g": 194.4, "cpu_onnx_ms": 525.8, "t4_trt_ms": 11.8},
}


def yolo_published(model: str) -> tuple[dict | None, str]:
    """(số liệu, nguồn) của 1 model YOLO — (None, '') nếu không có."""
    if model in YOLOV10:
        return YOLOV10[model], YOLOV10_SOURCE
    if model in YOLO26:
        return YOLO26[model], YOLO26_SOURCE
    return None, ""


# ── CLIP — Radford et al., "Learning Transferable Visual Models From Natural
#    Language Supervision", ICML 2021 (arXiv:2103.00020).
CLIP_SOURCE_RETRIEVAL = "CLIP paper Table 13 (ViT-L/14@336px)"
CLIP_SOURCE_ZEROSHOT = "CLIP paper Table 11"

# Table 13 — zero-shot retrieval. "CLIP" trong paper = ViT-L/14@336px
# (OpenCLIP: ViT-L-14-336 / openai). COCO = 5k test; Flickr30k = 1k test.
# Paper thêm tiền tố "a photo of" vào caption (tăng R@1 1–2 điểm).
CLIP_RETRIEVAL = {
    ("ViT-L-14-336", "openai"): {
        "mscoco_captions": {
            "text_to_image": {"R@1": 37.8, "R@5": 62.4, "R@10": 72.2},
            "image_to_text": {"R@1": 58.4, "R@5": 81.5, "R@10": 88.1},
        },
        "flickr30k": {
            "text_to_image": {"R@1": 68.7, "R@5": 90.6, "R@10": 95.2},
            "image_to_text": {"R@1": 88.0, "R@5": 98.7, "R@10": 99.4},
        },
    },
}

# Table 11 — zero-shot top-1 accuracy (%), prompt ensembling theo từng dataset.
CLIP_ZEROSHOT = {
    ("ViT-B-32", "openai"): {"cifar10": 91.3, "cifar100": 65.1, "imagenet": 63.2},
    ("ViT-B-16", "openai"): {"cifar10": 91.6, "cifar100": 68.7, "imagenet": 68.6},
    ("ViT-L-14", "openai"): {"cifar10": 96.2, "cifar100": 77.9, "imagenet": 75.3},
    ("ViT-L-14-336", "openai"): {"cifar10": 95.7, "cifar100": 77.5, "imagenet": 76.2},
}


# ── DINOv3 — Siméoni et al., "DINOv3", Meta AI 2025 (arXiv:2508.10104),
#    Table 14 (họ ViT distilled so với model open-source cùng cỡ).
#    Cột "Ox.-H" = Revisited Oxford, protocol Hard, mAP (%). Protocol (App. D.8):
#    cosine giữa CLS token query/database; Oxford/Paris: cạnh lớn = 224 px giữ tỉ
#    lệ rồi "full center crop" 224×224 (đệm đen). Hàng DINOv2 do tác giả DINOv3
#    đo lại cùng protocol; Sec. 6.1 ghi baseline là "DINOv2 with registers",
#    Table 14 không nói rõ → gán cùng số cho cả bản thường lẫn bản registers.
#    Paper không công bố Paris-H / Oxford-M cho model distilled (Table 9/23 chỉ có 7B).
DINO_SOURCE = "DINOv3 paper Table 14 (Ox.-H)"
DINO_RETRIEVAL = {
    "dinov3-vits16": {"roxford5k": {"mAP_H": 49.5}},
    "dinov3-vits16plus": {"roxford5k": {"mAP_H": 50.0}},
    "dinov3-vitb16": {"roxford5k": {"mAP_H": 58.5}},
    "dinov3-vitl16": {"roxford5k": {"mAP_H": 63.1}},
    "dinov3-vith16plus": {"roxford5k": {"mAP_H": 64.5}},
    "dinov2-small": {"roxford5k": {"mAP_H": 39.5}},
    "dinov2-base": {"roxford5k": {"mAP_H": 51.0}},
    "dinov2-large": {"roxford5k": {"mAP_H": 55.7}},
    "dinov2reg-small": {"roxford5k": {"mAP_H": 39.5}},
    "dinov2reg-base": {"roxford5k": {"mAP_H": 51.0}},
}
