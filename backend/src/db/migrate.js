// Schema bootstrap — chạy lúc khởi động server:
//  1. migration Better Auth (bảng user/session/account/verification + cột plugin),
//  2. DB trống (chưa có bảng media) → chạy schema.sql (toàn bộ bảng app),
//  3. DDL idempotent (IF NOT EXISTS) bên dưới cho DB đã có dữ liệu.
// Bước 1–2 lỗi → throw (server không chạy trên schema hỏng); bước 3 lỗi chỉ log.
import fs from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { dbPool } from "../config/db.js";
import { auth } from "../lib/auth.js";
import { LABEL_PRESETS } from "../modules/labels/labels.constants.js";
import { logger } from "../lib/logger.js";

async function bootstrap() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  const { rows } = await dbPool.query(`SELECT to_regclass('public.media') IS NOT NULL AS ready`);
  if (!rows[0].ready) {
    logger.info("DB trống → tạo bảng từ schema.sql");
    await dbPool.query(await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8"));
  }
}

export async function ensureSchema() {
  await bootstrap();
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
    // ── Gửi file (modules/transfers): link/QR cho khách + gửi thẳng bạn bè ──
    // P2P (WebRTC) → TURN → relay qua MinIO (mã hoá đầu-cuối, giữ 1 ngày).
    `CREATE TABLE IF NOT EXISTS transfers (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       sender_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       kind VARCHAR(10) NOT NULL CHECK (kind IN ('link', 'direct')),
       token_hash CHAR(64) UNIQUE,
       code VARCHAR(8),
       code_expires_at TIMESTAMPTZ,
       max_receivers INT,
       expires_at TIMESTAMPTZ NOT NULL,
       revoked_at TIMESTAMPTZ,
       purged_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_transfers_sender ON transfers (sender_id, created_at DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_code ON transfers (code) WHERE code IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_transfers_expires ON transfers (expires_at) WHERE purged_at IS NULL`,
    `CREATE TABLE IF NOT EXISTS transfer_files (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       transfer_id UUID NOT NULL REFERENCES transfers (id) ON DELETE CASCADE,
       position INT NOT NULL,
       name VARCHAR(255) NOT NULL,
       size BIGINT NOT NULL CHECK (size >= 0),
       mime VARCHAR(100) NOT NULL,
       media_id UUID REFERENCES media (id) ON DELETE SET NULL,
       thumb TEXT,
       relay_parts INT NOT NULL DEFAULT 0
     )`,
    `CREATE INDEX IF NOT EXISTS idx_transfer_files_transfer ON transfer_files (transfer_id, position)`,
    `CREATE TABLE IF NOT EXISTS transfer_relay_parts (
       file_id UUID NOT NULL REFERENCES transfer_files (id) ON DELETE CASCADE,
       part INT NOT NULL,
       size INT NOT NULL,
       PRIMARY KEY (file_id, part)
     )`,
    `CREATE TABLE IF NOT EXISTS transfer_recipients (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       transfer_id UUID NOT NULL REFERENCES transfers (id) ON DELETE CASCADE,
       user_id TEXT REFERENCES "user" (id) ON DELETE CASCADE,
       guest_id VARCHAR(64),
       -- Khách vào bằng mã 6 số nhận token riêng (link/QR dùng transfers.token_hash).
       access_hash CHAR(64) UNIQUE,
       display_name VARCHAR(100),
       wrapped_keys JSONB,
       status VARCHAR(12) NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'receiving', 'done', 'failed', 'declined')),
       via VARCHAR(8) CHECK (via IN ('p2p', 'turn', 'relay', 'server', 'copy')),
       bytes BIGINT NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ DEFAULT now(),
       started_at TIMESTAMPTZ,
       finished_at TIMESTAMPTZ,
       CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
     )`,
    `ALTER TABLE transfer_recipients ADD COLUMN IF NOT EXISTS access_hash CHAR(64) UNIQUE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_recipients_user
       ON transfer_recipients (transfer_id, user_id) WHERE user_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_recipients_guest
       ON transfer_recipients (transfer_id, guest_id) WHERE guest_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_transfer_recipients_inbox
       ON transfer_recipients (user_id, created_at DESC) WHERE user_id IS NOT NULL`,
    // Khoá công khai ECDH P-256 của từng trình duyệt — bọc khoá file cho bạn bè
    // đang offline (khoá riêng nằm trong IndexedDB, không rời máy).
    `CREATE TABLE IF NOT EXISTS user_device_keys (
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       device_id VARCHAR(64) NOT NULL,
       public_key JSONB NOT NULL,
       last_seen_at TIMESTAMPTZ DEFAULT now(),
       PRIMARY KEY (user_id, device_id)
     )`,
    // ── Moments (kiểu Locket): single / duo_square / trio_wide ──
    // media_id ON DELETE SET NULL: xoá vĩnh viễn ảnh của moment single không
    // xoá luôn moment (mất caption/reaction/meme) — card hiện "Ảnh đã bị xoá"
    // thay vì biến mất im lặng (P2.6).
    `CREATE TABLE IF NOT EXISTS moments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       media_id UUID REFERENCES media (id) ON DELETE SET NULL,
       template VARCHAR(30) NOT NULL DEFAULT 'single',
       caption TEXT,
       visibility VARCHAR(20) NOT NULL DEFAULT 'circle',
       expires_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_moments_user_id ON moments (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_moments_created_at ON moments (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_moments_user_created
       ON moments (user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS moment_collab (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
       slot_index INT NOT NULL CHECK (slot_index >= 0),
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       media_id UUID REFERENCES media (id) ON DELETE SET NULL,
       filled_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT now(),
       UNIQUE (moment_id, slot_index)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_moment_collab_moment ON moment_collab (moment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_moment_collab_user ON moment_collab (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_moment_collab_pending
       ON moment_collab (moment_id, filled_at)`,
    `CREATE TABLE IF NOT EXISTS moment_memes (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       image_url TEXT,
       template_id VARCHAR(64),
       caption TEXT,
       created_at TIMESTAMPTZ DEFAULT now()
     )`,
    `ALTER TABLE moment_memes ADD COLUMN IF NOT EXISTS image_object TEXT`,
    // Meme mới lưu object MinIO (`moments/<momentId>/memes/<memeId>.<ext>`) →
    // image_url chỉ còn là nguồn gốc/fallback (P2.2).
    `ALTER TABLE moment_memes ALTER COLUMN image_url DROP NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_moment_memes_moment
       ON moment_memes (moment_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_moment_memes_user ON moment_memes (user_id)`,
    `CREATE TABLE IF NOT EXISTS moment_reactions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       reaction_emoji VARCHAR(10) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT now(),
       UNIQUE (moment_id, user_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_moment_reactions_moment_id
       ON moment_reactions (moment_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS meme_reactions (
       meme_id UUID NOT NULL REFERENCES moment_memes (id) ON DELETE CASCADE,
       user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ DEFAULT now(),
       PRIMARY KEY (meme_id, user_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_meme_reactions_meme ON meme_reactions (meme_id)`,
    // single: media_id có thể NULL sau khi ảnh bị xoá vĩnh viễn; duo/trio luôn
    // NULL (ảnh nằm trong moment_collab). Constraint cũ chặn NULL → phải đổi.
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'moments'::regclass AND conname = 'chk_template_media'
       ) THEN
         ALTER TABLE moments DROP CONSTRAINT chk_template_media;
       END IF;
       ALTER TABLE moments ADD CONSTRAINT chk_template_media CHECK (
         template = 'single'
         OR (template IN ('duo_square', 'trio_wide') AND media_id IS NULL)
       );
     END $$`,
    // moments.media_id: CASCADE → SET NULL (P2.6).
    `DO $$
     DECLARE
       fk_name TEXT;
       del_type "char";
     BEGIN
       SELECT c.conname, c.confdeltype INTO fk_name, del_type
       FROM pg_constraint c
       WHERE c.conrelid = 'moments'::regclass
         AND c.contype = 'f'
         AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (media_id)%';
       IF fk_name IS NOT NULL AND del_type <> 'n' THEN
         EXECUTE format('ALTER TABLE moments DROP CONSTRAINT %I', fk_name);
         fk_name := NULL;
       END IF;
       IF fk_name IS NULL THEN
         ALTER TABLE moments
           ADD CONSTRAINT moments_media_id_fkey
           FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE SET NULL;
       END IF;
     END $$`,
    // Bảng cũ (tạo từ schema.sql) không có CHECK slot_index >= 0.
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'moment_collab'::regclass AND conname = 'chk_collab_slot_index'
       ) THEN
         ALTER TABLE moment_collab
           ADD CONSTRAINT chk_collab_slot_index CHECK (slot_index >= 0);
       END IF;
     END $$`,
    // Reaction bằng ảnh (meme MediaPipe) đã gỡ → chỉ còn emoji.
    `DELETE FROM moment_reactions WHERE reaction_emoji IS NULL`,
    `ALTER TABLE moment_reactions DROP COLUMN IF EXISTS reaction_media_id`,
    `ALTER TABLE moment_reactions ALTER COLUMN reaction_emoji SET NOT NULL`,
    // Bảng của thiết kế P2P cũ (thay bằng transfers*).
    `DROP TABLE IF EXISTS share_session_receivers, share_sessions`,
    // Trùng với index UNIQUE của cột token.
    `DROP INDEX IF EXISTS idx_share_links_token`,
    // Chỉnh ảnh không phá huỷ (basic edit) — xem schema.sql.
    `CREATE TABLE IF NOT EXISTS media_edits (
       media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
       recipe JSONB NOT NULL,
       display_object TEXT NOT NULL,
       thumbnail_object TEXT NOT NULL,
       thumbnail_small_object TEXT NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    // Index cho FK — xoá media / user khỏi phải quét cả bảng con.
    `CREATE INDEX IF NOT EXISTS idx_albums_cover_media ON albums (cover_media_id) WHERE cover_media_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_album_media_added_by ON album_media (added_by) WHERE added_by IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_share_links_media ON share_links (media_id) WHERE media_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_moments_media ON moments (media_id) WHERE media_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_moment_collab_media ON moment_collab (media_id) WHERE media_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_moment_reactions_user ON moment_reactions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meme_reactions_user ON meme_reactions (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_developer_requests_reviewer ON developer_requests (reviewed_by) WHERE reviewed_by IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_transfer_files_media ON transfer_files (media_id) WHERE media_id IS NOT NULL`,
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
      logger.error({ err }, `ensureSchema lỗi ở "${preview}…"`);
    }
  }
}
