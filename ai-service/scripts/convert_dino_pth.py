#!/usr/bin/env python3
"""Chuyển checkpoint DINOv3 gốc của Meta (.pth) → định dạng Hugging Face.

Dùng khi tải weights qua form của Meta (email link .pth) thay vì HF Hub. Sau
khi chuyển, provider `dinov3` và `bench/dino_retrieval.py` đọc thư mục
`models/<tên repo HF>/` y như bản tải từ HF — không cần code của Meta.

Usage (từ ai-service/):
    uv run python scripts/convert_dino_pth.py models/dinov3-pth/dinov3_vits16_pretrain_lvd1689m-08c60483.pth

Mapping key + config + giá trị kiểm tra lấy theo script chính thức của
transformers (`models/dinov3_vit/convert_dinov3_vit_to_hf.py`):
  - qkv tách đều thành q/k/v; bỏ k bias + bias_mask (DINOv3 không dùng bias cho key)
  - rope periods bỏ (HF tự tính lại), mask_token thêm 1 chiều
  - kiểm tra CLS (pooler_output) trên ảnh COCO val2017 000000039769.jpg, atol 1e-3
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

# Tên file .pth (tiền tố trước "-<hash>") → (thư mục HF, config, CLS kỳ vọng 5 chiều đầu).
VARIANTS = {
    "dinov3_vits16_pretrain_lvd1689m": (
        "dinov3-vits16-pretrain-lvd1689m",
        dict(
            patch_size=16, hidden_size=384, intermediate_size=1536, num_hidden_layers=12,
            num_attention_heads=6, proj_bias=True, num_register_tokens=4,
            use_gated_mlp=False, hidden_act="gelu",
        ),
        [0.463561, -0.415609, 0.408236, -0.126613, -0.286636],
    ),
}
TEST_IMAGE = "coco/images/val2017/000000039769.jpg"

KEY_MAPPING = [
    (r"^cls_token$", "embeddings.cls_token"),
    (r"^mask_token$", "embeddings.mask_token"),
    (r"^storage_tokens$", "embeddings.register_tokens"),
    (r"^patch_embed\.proj\.", "embeddings.patch_embeddings."),
    (r"^blocks\.(\d+)\.attn\.proj\.", r"model.layer.\1.attention.o_proj."),
    (r"^blocks\.(\d+)\.attn\.", r"model.layer.\1.attention."),
    (r"^blocks\.(\d+)\.ls(\d)\.gamma$", r"model.layer.\1.layer_scale\2.lambda1"),
    (r"^blocks\.(\d+)\.mlp\.fc1\.", r"model.layer.\1.mlp.up_proj."),
    (r"^blocks\.(\d+)\.mlp\.fc2\.", r"model.layer.\1.mlp.down_proj."),
    (r"^blocks\.(\d+)\.norm", r"model.layer.\1.norm"),
]
SKIP = ("bias_mask", "rope_embed.periods")


def rename(key: str) -> str:
    for pattern, replacement in KEY_MAPPING:
        new, n = re.subn(pattern, replacement, key)
        if n:
            return new
    return key  # norm.weight / norm.bias giữ nguyên


def convert_state_dict(original: dict) -> dict:
    import torch

    converted = {}
    for key, tensor in original.items():
        if any(s in key for s in SKIP):
            continue
        new_key = rename(key)
        if new_key.endswith("attention.qkv.weight") or new_key.endswith("attention.qkv.bias"):
            q, k, v = torch.chunk(tensor, 3, dim=0)
            prefix, kind = new_key.rsplit(".qkv.", 1)
            converted[f"{prefix}.q_proj.{kind}"] = q
            if kind == "weight":  # key không có bias
                converted[f"{prefix}.k_proj.{kind}"] = k
            converted[f"{prefix}.v_proj.{kind}"] = v
            continue
        if new_key == "embeddings.mask_token":
            tensor = tensor.unsqueeze(1)
        converted[new_key] = tensor
    return converted


def main() -> int:
    parser = argparse.ArgumentParser(description="DINOv3 .pth (Meta) → Hugging Face.")
    parser.add_argument("checkpoint", type=Path, help="File .pth tải từ link email của Meta.")
    parser.add_argument("--out", type=Path, default=None, help="Default: models/<tên repo HF>/")
    parser.add_argument("--test-image", type=Path, default=None, help=f"Default: $TNG_DATASETS/{TEST_IMAGE}")
    args = parser.parse_args()

    import torch
    from transformers import AutoModel, DINOv3ViTConfig, DINOv3ViTImageProcessor

    stem = args.checkpoint.name.split("-")[0].removesuffix(".pth")
    if stem not in VARIANTS:
        print(f"Chưa hỗ trợ {stem!r} (có: {', '.join(VARIANTS)}).", file=sys.stderr)
        return 1
    folder, config_kwargs, expected_cls = VARIANTS[stem]
    out = args.out or SERVICE_ROOT / "models" / folder

    # weights_only=True: chỉ đọc tensor, không chạy code trong pickle.
    original = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    model = AutoModel.from_config(DINOv3ViTConfig(**config_kwargs)).eval()
    converted = convert_state_dict(original)
    # buffer RoPE (inv_freq) tự sinh → không có trong checkpoint.
    result = model.load_state_dict(converted, strict=False)
    missing = [k for k in result.missing_keys if "inv_freq" not in k]
    if missing or result.unexpected_keys:
        print(f"Key lệch — missing: {missing} · unexpected: {result.unexpected_keys}", file=sys.stderr)
        return 1
    print(f"✓ {len(converted)} tensor khớp {type(model).__name__}", flush=True)

    # Image processor giống script chính thức: resize 224×224, bilinear, ImageNet mean/std.
    processor = DINOv3ViTImageProcessor(do_resize=True, size={"height": 224, "width": 224}, resample=2)

    test_image = args.test_image
    if test_image is None:
        from bench.common import DEFAULT_DATA_ROOT

        test_image = DEFAULT_DATA_ROOT / TEST_IMAGE
    if test_image.exists():
        from PIL import Image

        inputs = processor(images=Image.open(test_image).convert("RGB"), return_tensors="pt")
        with torch.inference_mode():
            cls = model(**inputs).pooler_output[0, :5]
        expected = torch.tensor(expected_cls)
        ok = torch.allclose(cls, expected, atol=1e-3, rtol=1e-3)
        print(f"{'✓' if ok else '✗'} CLS 5 chiều đầu: {[round(v, 6) for v in cls.tolist()]}")
        print(f"  kỳ vọng (transformers):  {expected_cls}")
        if not ok:
            print("Kết quả lệch với giá trị chính thức — không lưu.", file=sys.stderr)
            return 1
    else:
        print(f"! Không thấy ảnh kiểm tra {test_image} — bỏ qua bước so giá trị.")

    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out)
    processor.save_pretrained(out)
    print(f"✅ Đã lưu → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
