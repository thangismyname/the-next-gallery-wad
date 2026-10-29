"""OpenCLIP embedding provider — image + text encoder cho semantic search.

Dùng `open_clip_torch` (CLIP). Ảnh và câu truy vấn text được chiếu vào cùng
không gian vector, nên cosine similarity giữa embedding ảnh (lưu trong DB) và
embedding text truy vấn cho phép tìm ảnh theo mô tả tự nhiên.

Model mặc định ViT-B-32 / laion2b_s34b_b79k (512 chiều). Weights tự tải về
cache của OpenCLIP ở lần chạy đầu tiên.
"""
import io
import math

import numpy as np
from PIL import Image

from app.providers.embed_base import EmbeddingProvider

try:
    import torch
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "Provider 'open_clip' cần torch. Cài đặt: "
        "pip install torch torchvision open_clip_torch "
        "hoặc đặt AI_EMBED_PROVIDER=stub để chạy skeleton."
    ) from exc


def _safe_template(template: str, label: str) -> str:
    """Thay `{}` trong template bằng nhãn; nếu không có placeholder thì nối đuôi."""
    if "{}" in template:
        return template.format(label)
    return f"{template} {label}"


class OpenClipEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str, pretrained: str, device: str = "auto") -> None:
        import open_clip  # import muộn — chỉ cần khi thực sự dùng provider này

        self._model_name = model_name
        self._pretrained = pretrained
        self._device = self._resolve_device(device)

        model, _, preprocess = open_clip.create_model_and_transforms(
            model_name,
            pretrained=pretrained,
            device=self._device,
        )
        model.eval()

        self._model = model
        self._preprocess = preprocess
        self._tokenizer = open_clip.get_tokenizer(model_name)
        self._dimension = self._resolve_dimension()

    @property
    def name(self) -> str:
        return "open_clip"

    @property
    def model(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def logit_scale(self) -> float:
        """logit_scale học được của CLIP (nhiệt độ softmax)."""
        logit_scale = getattr(self._model, "logit_scale", None)
        if logit_scale is None:
            return 100.0
        with torch.no_grad():
            value = float(logit_scale.cpu().float().item())
        if value > 30:  # đã là scale (không phải log-space)
            return value
        return math.exp(value)

    def encode_image(self, image_bytes: bytes) -> list[float]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = self._preprocess(image).unsqueeze(0).to(self._device)
        with torch.no_grad():
            features = self._model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].float().cpu().tolist()

    def encode_text(self, text: str) -> list[float]:
        tokens = self._tokenizer([text]).to(self._device)
        with torch.no_grad():
            features = self._model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].float().cpu().tolist()

    def encode_images(self, images: list[bytes]) -> np.ndarray:
        if not images:
            return np.zeros((0, self._dimension), dtype=np.float32)
        tensor = torch.stack(
            [self._preprocess(Image.open(io.BytesIO(b)).convert("RGB")) for b in images]
        ).to(self._device)
        with torch.no_grad():
            features = self._model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().numpy()

    def encode_texts(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self._dimension), dtype=np.float32)
        tokens = self._tokenizer(texts).to(self._device)
        with torch.no_grad():
            features = self._model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().numpy()

    def classify(
        self,
        image_bytes: bytes,
        labels: list[str],
        templates: list[str] | None = None,
    ) -> list[dict]:
        if len(labels) < 2:
            raise ValueError("Cần ít nhất 2 nhãn để classify (softmax).")

        templates = templates or ["a photo of a {}"]

        image_vec = np.asarray(self.encode_image(image_bytes), dtype=np.float32)

        similarities = np.zeros(len(labels), dtype=np.float32)
        for i, label in enumerate(labels):
            # Prompt ensembling: trung bình embedding text của các template
            # (giống CLIP paper) rồi chuẩn hoá lại.
            label_vecs = [
                np.asarray(
                    self.encode_text(_safe_template(tpl, label)),
                    dtype=np.float32,
                )
                for tpl in templates
            ]
            mean_vec = np.mean(label_vecs, axis=0)
            norm = np.linalg.norm(mean_vec) or 1.0
            mean_vec = mean_vec / norm
            similarities[i] = float(np.dot(image_vec, mean_vec))

        logits = similarities * self.logit_scale
        logits -= logits.max()
        exp = np.exp(logits, dtype=np.float64)
        probabilities = exp / exp.sum()

        predictions = [
            {
                "label": label,
                "probability": round(float(prob), 6),
                "similarity": round(float(sim), 6),
            }
            for label, prob, sim in zip(labels, probabilities, similarities)
        ]
        predictions.sort(key=lambda p: p["probability"], reverse=True)
        return predictions

    def _resolve_dimension(self) -> int:
        output_dim = getattr(self._model.visual, "output_dim", None)
        if output_dim:
            return int(output_dim)
        # Fallback: encode một token bất kỳ để đo chiều thực tế.
        with torch.no_grad():
            tokens = self._tokenizer(["x"]).to(self._device)
            return int(self._model.encode_text(tokens).shape[-1])

    @staticmethod
    def _resolve_device(device: str) -> str:
        if device and device != "auto":
            return device
        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
