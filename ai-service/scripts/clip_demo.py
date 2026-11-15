#!/usr/bin/env python3
"""CLI demo cho ai-service — dùng OpenCLIP theo đúng bài CLIP
"Learning Transferable Visual Models From Natural Language Supervision".

Hai chế độ:
  --http   (mặc định) gọi HTTP API trên ai-service đang chạy.
  --direct import trực tiếp provider (không cần server), chạy từ thư mục
           ai-service/ với `AI_EMBED_PROVIDER=open_clip`.

Usage:
  python scripts/clip_demo.py info
  python scripts/clip_demo.py embed-image path/to.jpg
  python scripts/clip_demo.py embed-text "a photo of a red car"
  python scripts/clip_demo.py classify path/to.jpg dog car cat
  python scripts/clip_demo.py classify path/to.jpg dog car cat \
      --templates '["a photo of a {}", "a bad photo of a {}"]'
  python scripts/clip_demo.py similarity path/to.jpg "a red car"

  # không cần server:
  AI_EMBED_PROVIDER=open_clip python scripts/clip_demo.py --direct classify ...
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

DEFAULT_URL = "http://localhost:8000"

MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


# ──── HTTP client ────────────────────────────────────────────────────────
def http_get(base: str, path: str) -> dict:
    with urllib.request.urlopen(f"{base}{path}", timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(base: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_multipart(base: str, path: str, fields: dict, file_path: str) -> dict:
    if not os.path.exists(file_path):
        sys.exit(f"Không tìm thấy file: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    mime = MIME_BY_EXT.get(ext, "application/octet-stream")
    boundary = "----clipdemo" + os.urandom(16).hex()
    body = b""
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")
    filename = os.path.basename(file_path)
    body += (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    with open(file_path, "rb") as fh:
        body += fh.read()
    body += f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        f"{base}{path}",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ──── Direct import (không cần server) ───────────────────────────────────
def get_direct_provider():
    try:
        from app.providers import get_embedding_provider
    except ModuleNotFoundError:
        sys.exit("--direct phải chạy từ thư mục ai-service/ (PYTHONPATH trỏ vào app).")
    provider = get_embedding_provider()
    if provider.name == "stub":
        print("⚠️  Đang dùng stub provider — set AI_EMBED_PROVIDER=open_clip để chạy CLIP thật.")
    return provider


# ──── Helpers ────────────────────────────────────────────────────────────
def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    return dot  # vector đều unit-norm

def print_embed(provider: str, model: str, dimension: int, embedding: list[float]) -> None:
    print(f"provider={provider} model={model} dimension={dimension}")
    preview = ", ".join(f"{v:.4f}" for v in embedding[:8])
    print(f"embedding[:8] = [{preview}, ...]")

def print_predictions(predictions: list[dict]) -> None:
    print(f"{'label':<20} {'probability':>12}  {'similarity':>10}")
    for p in predictions:
        print(f"{p['label']:<20} {p['probability']:>12.4%}  {p['similarity']:>10.4f}")


# ──── Commands ───────────────────────────────────────────────────────────
def cmd_info(args) -> None:
    if args.direct:
        p = get_direct_provider()
        print(f"provider={p.name} model={p.model} dimension={p.dimension}")
        scale = getattr(p, "logit_scale", None)
        if scale:
            print(f"logit_scale={scale:.2f} (nhiệt độ softmax zero-shot)")
    else:
        info = http_get(args.url, "/api/v1/embed/info")
        print(f"provider={info['provider']} model={info['model']} dimension={info['dimension']}")

def cmd_embed_image(args) -> None:
    if args.direct:
        p = get_direct_provider()
        with open(args.image, "rb") as fh:
            vec = p.encode_image(fh.read())
        print_embed(p.name, p.model, p.dimension, vec)
    else:
        data = http_post_multipart(args.url, "/api/v1/embed/image", {}, args.image)
        print_embed(data["provider"], data["model"], data["dimension"], data["embedding"])

def cmd_embed_text(args) -> None:
    texts = [args.text] if args.text else [t.strip() for t in sys.stdin if t.strip()]
    for text in texts:
        print(f"text: {text!r}")
        if args.direct:
            p = get_direct_provider()
            vec = p.encode_text(text)
            print_embed(p.name, p.model, p.dimension, vec)
        else:
            data = http_post_json(args.url, "/api/v1/embed/text", {"text": text})
            print_embed(data["provider"], data["model"], data["dimension"], data["embedding"])
        print()

def cmd_classify(args) -> None:
    labels = args.labels
    templates = json.loads(args.templates) if args.templates else ["a photo of a {}"]
    print(f"Ảnh: {args.image}")
    print(f"Nhãn: {labels}")
    print(f"Templates ({len(templates)}): {templates}\n")

    if args.direct:
        p = get_direct_provider()
        with open(args.image, "rb") as fh:
            preds = p.classify(fh.read(), labels, templates)
        print_predictions(preds)
    else:
        fields = {
            "labels": json.dumps(labels),
            "templates": json.dumps(templates),
        }
        data = http_post_multipart(args.url, "/api/v1/classify", fields, args.image)
        print(f"provider={data['provider']} model={data['model']}")
        print_predictions(data["predictions"])

def cmd_similarity(args) -> None:
    with open(args.image, "rb") as fh:
        img_bytes = fh.read()
    if args.direct:
        p = get_direct_provider()
        img_vec = p.encode_image(img_bytes)
        text_vec = p.encode_text(args.text)
    else:
        img_vec = http_post_multipart(args.url, "/api/v1/embed/image", {}, args.image)["embedding"]
        text_vec = http_post_json(args.url, "/api/v1/embed/text", {"text": args.text})["embedding"]
    sim = cosine(img_vec, text_vec)
    print(f"cosine(image, {args.text!r}) = {sim:.4f}")
    if sim >= 0.22:
        print("→ Khớp ngữ nghĩa (≥ ngưỡng 0.22)")
    else:
        print("→ Dưới ngưỡng 0.22 (ít liên quan)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="clip_demo", description=__doc__)
    parser.add_argument("--url", default=os.environ.get("AI_SERVICE_URL", DEFAULT_URL),
                        help=f"Base URL ai-service (default {DEFAULT_URL}, hoặc $AI_SERVICE_URL)")
    parser.add_argument("--direct", action="store_true",
                        help="Import provider trực tiếp, không cần server (chạy từ ai-service/)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("info", help="Thông tin provider embedding")

    p_embed_image = sub.add_parser("embed-image", help="Embed 1 ảnh")
    p_embed_image.add_argument("image")

    p_embed_text = sub.add_parser("embed-text", help="Embed text (hoặc đọc stdin)")
    p_embed_text.add_argument("text", nargs="?", help="Câu truy vấn; bỏ trống để đọc stdin")

    p_classify = sub.add_parser("classify", help="Zero-shot classify theo CLIP paper")
    p_classify.add_argument("image")
    p_classify.add_argument("labels", nargs="+", help="Ít nhất 2 nhãn")
    p_classify.add_argument("--templates", default=None,
                            help='JSON array template, vd \'["a photo of a {}"]\'')

    p_sim = sub.add_parser("similarity", help="Cosine giữa ảnh và text")
    p_sim.add_argument("image")
    p_sim.add_argument("text")

    args = parser.parse_args()
    cmd = {
        "info": cmd_info,
        "embed-image": cmd_embed_image,
        "embed-text": cmd_embed_text,
        "classify": cmd_classify,
        "similarity": cmd_similarity,
    }[args.command]
    cmd(args)


if __name__ == "__main__":
    main()
