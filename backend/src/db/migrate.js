// Schema bootstrap — chạy lúc khởi động server. DDL nhẹ, idempotent (IF NOT
// EXISTS) để tự thêm cột/bảng mới cho môi trường dev mà không cần migrate thủ công.
import { dbPool } from "../config/db.js";
import { LABEL_PRESETS } from "../modules/labels/labels.constants.js";

export async function ensureSchema() {
  const statements = [
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS thumbnail_small_object TEXT`,
    // Bản xem ≤2048px (lightbox) — ảnh cũ NULL, tự tạo khi được gọi lần đầu.
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS display_object TEXT`,
    // Bản WebP độ phân giải gốc — chỉ HEIC (trình duyệt không hiển thị được).
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS full_object TEXT`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false`,
    // Ngày chụp (EXIF / metadata video) — thư viện nhóm + sắp theo
    // COALESCE(taken_at, created_at). Ảnh cũ: npm run backfill:taken-at.
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_media_user_taken
       ON media (user_id, (COALESCE(taken_at, created_at)) DESC)
       WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_media_deleted_at
       ON media (deleted_at)
       WHERE deleted_at IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_media_is_favorite
       ON media (user_id, is_favorite)
       WHERE is_favorite = true`,
    // ── AI phase: embeddings cho semantic search (OpenCLIP + pgvector) ──
    `CREATE EXTENSION IF NOT EXISTS vector`,
    `CREATE TABLE IF NOT EXISTS media_embeddings (
       media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       model VARCHAR(100) NOT NULL,
       embedding vector(512) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_media_embeddings_user
       ON media_embeddings (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_media_embeddings_hnsw
       ON media_embeddings USING hnsw (embedding vector_cosine_ops)`,
    // ── AI phase: YOLO26 object detection ──
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS yolo_processed_at TIMESTAMPTZ`,
    `CREATE TABLE IF NOT EXISTS media_detections (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       class_name VARCHAR(80) NOT NULL,
       confidence REAL NOT NULL,
       bbox REAL[] NOT NULL,
       model VARCHAR(100) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       UNIQUE (media_id, model, class_name, confidence, bbox)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_media_detections_user_class
       ON media_detections (user_id, class_name)`,
    `CREATE INDEX IF NOT EXISTS idx_media_detections_media
       ON media_detections (media_id)`,
    // ── AI phase: DINOv3 image similarity (ảnh tương tự) ──
    // vector(384) = DINOv3 ViT-S/16 (pooler_output / CLS token).
    `CREATE TABLE IF NOT EXISTS media_dino_embeddings (
       media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       model VARCHAR(100) NOT NULL,
       embedding vector(384) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_media_dino_embeddings_user
       ON media_dino_embeddings (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_media_dino_embeddings_hnsw
       ON media_dino_embeddings USING hnsw (embedding vector_cosine_ops)`,
    // ── AI phase: gắn tag nội dung (classification, 17 tag) ──
    // Lưu xác suất của MỌI tag cho mỗi ảnh (kể cả dưới ngưỡng) → đổi ngưỡng
    // trên UI không cần chạy lại model; ảnh có row = đã phân loại.
    `CREATE TABLE IF NOT EXISTS media_tags (
       media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       tag VARCHAR(40) NOT NULL,
       confidence REAL NOT NULL,
       threshold REAL NOT NULL,
       model VARCHAR(160) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       PRIMARY KEY (media_id, tag)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_media_tags_user_tag
       ON media_tags (user_id, tag, confidence DESC)`,
    // ── Albums: album thông minh (truy vấn lưu lại) + ai thêm ảnh vào album chung ──
    `ALTER TABLE albums ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'manual'`,
    `ALTER TABLE albums ADD COLUMN IF NOT EXISTS smart_rule JSONB`,
    `ALTER TABLE album_media ADD COLUMN IF NOT EXISTS added_by TEXT
       REFERENCES "user" (id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS idx_share_links_album ON share_links (album_id)`,
    // ── Developer Mode (request/approval) ──
    `CREATE TABLE IF NOT EXISTS developer_requests (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id TEXT UNIQUE NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       status VARCHAR(20) NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'approved', 'rejected')),
       message TEXT,
       reviewed_by TEXT REFERENCES "user" (id) ON DELETE SET NULL,
       reviewed_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_developer_requests_status
       ON developer_requests (status)`,
    // ── Nhãn cá nhân (trang Yêu thích) — độc lập với is_favorite ──
    `CREATE TABLE IF NOT EXISTS user_labels (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       name VARCHAR(40) NOT NULL,
       color VARCHAR(16) NOT NULL DEFAULT 'slate',
       position INT NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_labels_name
       ON user_labels (user_id, lower(name))`,
    `CREATE TABLE IF NOT EXISTS media_user_labels (
       label_id UUID NOT NULL REFERENCES user_labels (id) ON DELETE CASCADE,
       media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ DEFAULT now(),
       PRIMARY KEY (label_id, media_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_media_user_labels_media
       ON media_user_labels (media_id)`,
    // Nhãn gợi ý lưu theo key (name NULL → FE dịch theo ngôn ngữ).
    `ALTER TABLE user_labels ADD COLUMN IF NOT EXISTS preset VARCHAR(20)`,
    `ALTER TABLE user_labels ALTER COLUMN name DROP NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_labels_preset
       ON user_labels (user_id, preset) WHERE preset IS NOT NULL`,
    // Dòng cũ lưu nhầm key i18n thô làm tên → chuyển sang preset.
    `UPDATE user_labels
        SET preset = substring(name FROM 'favorites\\.labels\\.suggested\\.([a-z]+)$'), name = NULL
      WHERE preset IS NULL AND name ~ '^favorites\\.labels\\.suggested\\.[a-z]+$'`,
    // Đã tạo bộ nhãn gợi ý cho user chưa (xoá hết nhãn cũng không tạo lại).
    `CREATE TABLE IF NOT EXISTS user_label_seeds (
       user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
  ];
  // Nhãn gợi ý cũ đã lưu thành chữ ("In ảnh"…) → preset (dịch theo ngôn ngữ).
  for (const [key, { names }] of Object.entries(LABEL_PRESETS)) {
    statements.push({
      text: `UPDATE user_labels l SET preset = $1, name = NULL
              WHERE l.preset IS NULL AND lower(l.name) = ANY($2::text[])
                AND NOT EXISTS (SELECT 1 FROM user_labels x
                                 WHERE x.user_id = l.user_id AND x.preset = $1)`,
      values: [key, names.map((n) => n.toLowerCase())],
    });
  }
  for (const statement of statements) {
    try {
      await dbPool.query(statement);
    } catch (err) {
      const preview = (statement.text ?? statement).replace(/\s+/g, " ").slice(0, 80);
      console.error(`❌ ensureSchema lỗi ở "${preview}…":`, err.message);
    }
  }
}
