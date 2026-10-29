# Ảnh tương tự (DINOv3)

Tính năng **"Ảnh tương tự"** trong Lightbox (panel *Chi tiết*): mở 1 ảnh → hiện
tối đa 12 ảnh khác của user giống nhất về mặt thị giác, kèm % cosine similarity.

## DINOv3 là gì

- **DINOv3** (Meta AI, 08/2025 — *"DINOv3"*, Siméoni et al., arXiv:2508.10104)
  là vision foundation model **tự giám sát** (self-supervised, không dùng
  nhãn/text). Thế hệ tiếp theo của DINO (2021) và DINOv2 (2023).
- Huấn luyện ViT-7B trên **LVD-1689M** (1.7 tỷ ảnh web đã lọc), sau đó *distill*
  ra các model nhỏ: ViT-S/16 (21M), ViT-S+/16 (29M), ViT-B/16 (86M), ViT-L/16
  (300M), ViT-H+/16 (840M) và ConvNeXt T/S/B/L.
- Điểm mới so với DINOv2:
  - **Gram anchoring** — giữ chất lượng *dense feature* (patch) không bị suy
    giảm khi train lâu / model lớn.
  - Patch 16 + RoPE + 4 register tokens → chạy tốt ở nhiều độ phân giải.
  - Post-hoc high-resolution adaptation và distillation đa-model.
- Đầu ra: **CLS token** (global descriptor — dùng cho retrieval/kNN) + **patch
  tokens** (dense — segmentation, depth, matching).

### Vì sao dùng DINOv3 thay vì CLIP cho "ảnh tương tự"

| | CLIP (đang dùng cho Spotlight) | DINOv3 |
|---|---|---|
| Huấn luyện | Ảnh–text contrastive | Self-supervised, chỉ ảnh |
| Mạnh ở | Ngữ nghĩa theo ngôn ngữ ("chó trên biển") | Cấu trúc thị giác: bố cục, đối tượng cụ thể, góc chụp, gần trùng |
| Query bằng text | ✅ | ❌ |
| Ảnh↔ảnh / near-duplicate | Khá (nền cosine cao, ~0.5 cho ảnh không liên quan) | Tốt hơn, phân tách rõ hơn |

Hai model **bổ sung** cho nhau: CLIP cho tìm kiếm bằng chữ, DINOv3 cho tìm ảnh
giống ảnh (và là nền cho tính năng dedup sau này).

## Kiến trúc trong project

```text
upload ảnh ─► backend embedDinoInBackground ─► ai-service POST /api/v1/similarity/embed
                                                 (DINOv3 ViT-S/16, pooler_output, L2-norm, 384-d)
            ◄── lưu media_dino_embeddings (pgvector vector(384), HNSW cosine)

Lightbox ─► GET /api/gallery/media/:id/similar?limit=12
            1. lấy vector ảnh nguồn (chưa có → tạo on-demand)
            2. k-NN cosine (<=>) trong ảnh cùng user + cùng model, ≥ AI_DINO_MIN_SIM
            3. ai-service không chạy / lỗi → fallback CLIP image↔image (≥ 0.75)
            → { source: "dinov3" | "clip" | null, model, items: MediaListItem[] (+score) }
```

| Thành phần | File |
|---|---|
| Provider | `ai-service/app/providers/dinov3.py`, `similarity_stub.py`, `similarity_base.py` |
| Endpoint | `ai-service/app/api/similarity.py` (`POST /similarity/embed`, `GET /similarity/info`) |
| Tải weights | `ai-service/scripts/download_dino_weight.py` |
| Backend | `backend/src/modules/ai/similarity.service.js`, route trong `media.routes.js` |
| Backfill | `npm run backfill:dino [userId]`, hoặc `POST /api/gallery/media/similar/backfill` |
| Frontend | `hooks/useSimilarMedia.ts`, `MediaDetailsPanel.tsx` (mục *Ảnh tương tự*), `Lightbox.tsx` |

## Cài đặt

1. **Xin quyền model (gated)** — mở
   <https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m>, đăng nhập,
   chấp nhận *DINOv3 License*.
2. Tạo token *Read* tại <https://huggingface.co/settings/tokens>, rồi:

   ```bash
   cd ai-service
   uv sync
   uv run hf auth login                       # dán token
   uv run python scripts/download_dino_weight.py
   # → ai-service/models/dinov3-vits16-pretrain-lvd1689m/ (~87MB safetensors)
   ```

   **Cách khác (không qua HF):** xin quyền ở form của Meta
   (<https://ai.meta.com/resources/models-and-libraries/dinov3-downloads/>), tải
   file `.pth` từ link trong email rồi chuyển sang định dạng HF:

   ```bash
   cd ai-service
   mkdir -p models/dinov3-pth && cp ~/Downloads/dinov3_vits16_pretrain_lvd1689m-*.pth models/dinov3-pth/
   uv run python scripts/convert_dino_pth.py models/dinov3-pth/dinov3_vits16_pretrain_lvd1689m-*.pth
   # → models/dinov3-vits16-pretrain-lvd1689m/ ; tự so CLS với giá trị chính thức của transformers
   ```

3. `.env` ở root:

   ```env
   AI_SIMILARITY_PROVIDER=dinov3
   AI_DINO_MODEL=models/dinov3-vits16-pretrain-lvd1689m
   ```

4. Restart ai-service + backend (backend tự tạo bảng `media_dino_embeddings`),
   rồi backfill ảnh cũ: `cd backend && npm run backfill:dino`.

Kiểm tra: `curl -F file=@photo.jpg http://localhost:8000/api/v1/similarity/embed`
→ `{"provider":"dinov3","model":"dinov3-vits16-pretrain-lvd1689m","dimension":384,...}`.

## Lưu ý

- **Số chiều cố định 384** (cột `vector(384)`). Đổi sang ViT-B/16 (768) hay
  ViT-L/16 (1024) cần đổi cột + xoá dữ liệu cũ.
- Provider `stub` **không lưu** vector vào DB. Khi DINOv3 chưa bật, Lightbox tự
  dùng CLIP image↔image (nhãn nhỏ "CLIP" cạnh tiêu đề mục). Similarity chỉ so
  các vector **cùng `model`**, nên đổi model DINOv3 không làm lẫn kết quả.
- `AI_DINO_MIN_SIM` (mặc định 0.35) là giá trị khởi điểm. Nên tinh chỉnh trên dữ
  liệu thật (xem phân bố score trong Lightbox).
- Docker: weights gated nên **chưa bake vào image**. Mount
  `ai-service/models/` vào container, hoặc truyền `HF_TOKEN` rồi để
  `AI_DINO_MODEL=facebook/dinov3-vits16-pretrain-lvd1689m` tự tải lúc khởi động.
- License DINOv3 là license riêng của Meta (không phải Apache/MIT). Dùng cho
  nghiên cứu / luận văn thì ổn, nhưng cần đọc điều khoản nếu thương mại hoá.
