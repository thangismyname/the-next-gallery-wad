-- ==========================================================
-- schema.sql — The Next Gallery — PHASE 1
-- Backend tự chạy file này lúc khởi động (db/migrate.js::ensureSchema) khi DB
-- chưa có bảng media — SAU KHI đã chạy migration Better Auth (bảng "user",
-- "session", "account", "verification"). Không cần chạy tay.
--
-- Gồm mọi bảng app (media, album, moments, AI, nhãn, quick send…). Thay đổi
-- cho DB đã có dữ liệu viết thêm ở migrate.js (idempotent) — sửa cả 2 nơi.
--
-- File này gồm cả COMMENT ON TABLE/COLUMN ngay sau mỗi CREATE TABLE
-- — dùng làm tài liệu trực tiếp trong DB, TablePlus/DBeaver/pgAdmin
-- đều hiện được các comment này khi xem cấu trúc bảng.
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- cho gen_random_uuid()

-- ==========================================================
-- BETTER AUTH — không tạo bảng ở đây (đã có sẵn qua CLI của
-- Better Auth), chỉ gắn COMMENT để tài liệu hoá. "user" đang có
-- role/banned/banReason/banExpires vì Admin plugin đang bật.
-- ==========================================================
COMMENT ON TABLE "user" IS 'Tài khoản người dùng, quản lý bởi Better Auth. Có role/banned/banReason/banExpires vì Admin plugin đang được bật.';
COMMENT ON COLUMN "user".role IS 'Admin plugin của Better Auth — vd "admin" | "user". Quyết định quyền truy cập các tính năng quản trị.';
COMMENT ON COLUMN "session"."userId" IS 'FK tới user.id — chú ý tên cột camelCase (userId, không phải user_id) vì đây là bảng Better Auth, khác convention snake_case của các bảng app bên dưới.';
COMMENT ON COLUMN "account"."providerId" IS 'Provider đăng nhập, vd "credential" (email/password) hoặc "google", "github"...';
COMMENT ON COLUMN "account".password IS 'Hash password, chỉ có giá trị khi providerId = credential.';

-- ==========================================================
-- ENUM
-- ==========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
        CREATE TYPE media_type AS ENUM ('photo', 'video');
    END IF;
END$$;

-- ==========================================================
-- MEDIA — bảng lưu trữ file gốc (ảnh/video), dùng chung cho cả
-- Album lẫn Moments. Đây là "nguồn sự thật" duy nhất cho 1 file
-- đã upload — Album và Moment chỉ tham chiếu tới đây, không lưu
-- lại file info riêng.
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,

        media_type media_type NOT NULL DEFAULT 'photo',

        original_filename VARCHAR(255),
        caption TEXT,
        taken_at TIMESTAMPTZ,

        width INT,
        height INT,

        -- Riêng cho video — NULL với ảnh
        duration_seconds NUMERIC(10, 3),
        fps REAL,
        video_codec VARCHAR(50),
        thumbnail_object TEXT,
        -- Bản resize nhỏ (200px) cho lưới ảnh — nhẹ, tải nhanh.
        -- Nếu NULL (ảnh cũ), fallback về thumbnail_object (400px).
        thumbnail_small_object TEXT,
        -- Bản xem ≤2048px giữ tỉ lệ (WebP) cho lightbox + đầu vào AI.
        display_object TEXT,
        -- Bản WebP độ phân giải gốc — chỉ cho HEIC, tạo khi xem "Bản gốc".
        full_object TEXT,

        -- Lưu trữ MinIO
        minio_object TEXT NOT NULL,
        minio_bucket VARCHAR(100) DEFAULT 'gallery',
        file_ext VARCHAR(20),
        mime_type VARCHAR(100),
        file_size_kb INT,

        -- Thông tin chỉnh sửa/decor lúc chụp (filter, sticker, khung...)
        -- Đây chỉ là metadata áp dụng lúc capture, KHÔNG phải AI xử lý sau.
        decor_data JSONB,

        -- Chỗ trống cho phase AI sau này gắn thêm cột (yolo_status, clip_status...)
        extra_data JSONB,

        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now (),

        -- Soft-delete: NULL = đang hiện ở gallery, có giá trị = nằm trong Thùng rác.
        -- Ảnh trong thùng rác vẫn còn trên MinIO; xoá vĩnh viễn mới gỡ object.
        deleted_at TIMESTAMPTZ,

        -- Yêu thích (starred) — NULL/false = chưa, true = user gắn dấu sao.
        -- Dùng cho category "Favorites" trên Home / lọc gallery.
        is_favorite BOOLEAN NOT NULL DEFAULT false,

        UNIQUE (user_id, minio_object),
        CONSTRAINT chk_video_duration CHECK (
            media_type <> 'video' OR duration_seconds IS NOT NULL
        )
    );

CREATE INDEX IF NOT EXISTS idx_media_user_id ON media (user_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media (media_type);
CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media (taken_at);
-- Thư viện sắp/nhóm theo ngày chụp, thiếu thì ngày tải lên.
CREATE INDEX IF NOT EXISTS idx_media_user_taken
    ON media (user_id, (COALESCE(taken_at, created_at)) DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_deleted_at
    ON media (deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_is_favorite
    ON media (user_id, is_favorite)
    WHERE is_favorite = true;

COMMENT ON TABLE media IS 'File gốc (ảnh/video) đã upload lên MinIO. Là bảng trung tâm — mọi bảng khác (album_media, moments, moment_reactions) chỉ tham chiếu media_id, không copy lại thông tin file.';
COMMENT ON COLUMN media.user_id IS 'Chủ sở hữu file, FK tới bảng "user" của Better Auth. 1 user có nhiều media (1-n).';
COMMENT ON COLUMN media.media_type IS 'photo | video — quyết định các cột duration/fps/video_codec có giá trị hay NULL.';
COMMENT ON COLUMN media.duration_seconds IS 'Chỉ có giá trị khi media_type = video (ràng buộc bởi chk_video_duration). NULL với ảnh.';
COMMENT ON COLUMN media.thumbnail_object IS 'Object key trên MinIO của ảnh đại diện — cỡ trung (400px), dùng làm thumbnail lớn / fallback cho ảnh và video.';
COMMENT ON COLUMN media.thumbnail_small_object IS 'Object key trên MinIO của bản resize nhỏ (200px) dùng cho lưới ảnh (grid) — nhẹ và tải nhanh. NULL với dữ liệu cũ thì fallback về thumbnail_object.';
COMMENT ON COLUMN media.display_object IS 'Object key trên MinIO của bản xem (WebP, cạnh dài ≤2048px, giữ tỉ lệ) — lightbox hiển thị bản này thay vì file gốc; cũng là ảnh đưa cho CLIP/YOLO/DINO. Với video là poster (1 khung hình cắt bằng ffmpeg). NULL với ảnh cũ → endpoint thumbnail?size=display tự tạo khi được gọi lần đầu.';
COMMENT ON COLUMN media.full_object IS 'Object key trên MinIO của bản WebP độ phân giải gốc — CHỈ cho ảnh HEIC/HEIF (Chrome/Firefox không hiển thị được file gốc). Tạo khi người dùng bấm "Bản gốc"/phóng to trong lightbox. NULL với mọi định dạng khác.';
COMMENT ON COLUMN media.deleted_at IS 'Mốc soft-delete. NULL = file đang hiển thị bình thường ở Gallery. Khác NULL = file nằm trong Thùng rác (deleted_at là thời điểm xoá), vẫn còn nguyên trên MinIO để có thể khôi phục; chỉ bị gỡ object khi xoá vĩnh viễn.';
COMMENT ON COLUMN media.decor_data IS 'Metadata filter/sticker/khung áp dụng lúc chụp (từ tính năng Moments). Không phải kết quả AI, chỉ là cấu hình chỉnh sửa.';
COMMENT ON COLUMN media.extra_data IS 'Cột JSONB dự phòng — nơi phase AI sau này có thể lưu thêm dữ liệu linh hoạt mà không cần ALTER TABLE.';


-- ==========================================================
-- ALBUMS — nơi tổ chức/lưu trữ ảnh video theo bộ sưu tập
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS albums (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, -- chủ sở hữu

        name VARCHAR(255) NOT NULL,
        description TEXT,
        cover_media_id UUID REFERENCES media (id) ON DELETE SET NULL,

        is_shared BOOLEAN DEFAULT false, -- có ai khác ngoài owner truy cập không (đồng bộ với album_members)

        -- 'manual' = danh sách ảnh cố định (album_media) | 'smart' = truy vấn lưu lại
        kind VARCHAR(10) NOT NULL DEFAULT 'manual',
        -- Album thông minh: {"type":"tags","tags":["food"],"minConfidence":null}
        -- hoặc {"type":"query","query":"2 con chó trên bãi biển"} (search kết hợp)
        smart_rule JSONB,

        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums (user_id);

COMMENT ON TABLE albums IS 'Bộ sưu tập do user tạo để tổ chức media. Chủ sở hữu (user_id) luôn có toàn quyền; muốn chia sẻ cho người khác thì thêm record vào album_members.';
COMMENT ON COLUMN albums.user_id IS 'Chủ sở hữu album (owner gốc). Không đại diện cho tất cả người có quyền truy cập — xem thêm album_members.';
COMMENT ON COLUMN albums.cover_media_id IS 'Ảnh/video đại diện hiển thị ở ngoài danh sách album. NULL = FE tự lấy media mới nhất làm cover.';
COMMENT ON COLUMN albums.is_shared IS 'Cờ tiện lợi để query nhanh "album nào đang được share" mà không cần JOIN album_members mỗi lần — nên đồng bộ = true khi có record đầu tiên trong album_members.';

-- ==========================================================
-- ALBUM_MEDIA — quan hệ nhiều-nhiều: 1 media có thể nằm trong
-- nhiều album, 1 album chứa nhiều media
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS album_media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        album_id UUID NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
        media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,

        position INT, -- thứ tự hiển thị trong album, NULL = mặc định theo added_at
        added_by TEXT REFERENCES "user" (id) ON DELETE SET NULL, -- ai thêm (album chung: editor chỉ gỡ được ảnh mình thêm)
        added_at TIMESTAMPTZ DEFAULT now (),

        UNIQUE (album_id, media_id)
    );

CREATE INDEX IF NOT EXISTS idx_album_media_album_id ON album_media (album_id);
CREATE INDEX IF NOT EXISTS idx_album_media_media_id ON album_media (media_id);

COMMENT ON TABLE album_media IS 'Bảng nối n-n giữa albums và media. Không có bảng này thì 1 media chỉ thuộc được 1 album duy nhất (1-n) — có bảng này thì 1 media thả được vào nhiều album (vd vừa trong "Du lịch 2026" vừa trong "Bạn bè").';
COMMENT ON COLUMN album_media.position IS 'Thứ tự hiển thị trong album, tự set khi user kéo-thả sắp xếp lại. NULL = mặc định sort theo added_at.';

-- ==========================================================
-- ALBUM_MEMBERS — chia sẻ album cho user khác (album cộng tác)
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS album_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        album_id UUID NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,

        role VARCHAR(20) NOT NULL DEFAULT 'viewer', -- 'owner' | 'editor' | 'viewer'

        invited_at TIMESTAMPTZ DEFAULT now (),
        accepted_at TIMESTAMPTZ, -- NULL = lời mời chưa được chấp nhận

        UNIQUE (album_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_album_members_album_id ON album_members (album_id);
CREATE INDEX IF NOT EXISTS idx_album_members_user_id ON album_members (user_id);

COMMENT ON TABLE album_members IS 'Album cộng tác: ai (ngoài owner) được quyền xem/sửa album này. Bảng nối n-n giữa albums và user, có thêm role/accepted_at để quản lý lời mời.';
COMMENT ON COLUMN album_members.role IS 'owner | editor | viewer — owner thường trùng với albums.user_id, thêm ở đây để query quyền thống nhất 1 chỗ thay vì check riêng 2 nơi.';
COMMENT ON COLUMN album_members.accepted_at IS 'NULL = lời mời đang chờ (pending invite), có giá trị = user đã chấp nhận tham gia album.';

-- ==========================================================
-- SHARE_LINKS — chuyển file/album nhanh qua link, không cần
-- người nhận có tài khoản (giống Google Photos share link)
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS share_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        token VARCHAR(64) NOT NULL UNIQUE, -- chuỗi random dùng trong URL, vd /s/{token}

        created_by_user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,

        -- Chia sẻ 1 album HOẶC 1 file lẻ — bắt buộc có ít nhất 1
        album_id UUID REFERENCES albums (id) ON DELETE CASCADE,
        media_id UUID REFERENCES media (id) ON DELETE CASCADE,

        permission VARCHAR(20) NOT NULL DEFAULT 'view', -- 'view' | 'download' | 'edit'
        expires_at TIMESTAMPTZ, -- NULL = không hết hạn
        max_views INT, -- NULL = không giới hạn lượt xem
        view_count INT NOT NULL DEFAULT 0,

        created_at TIMESTAMPTZ DEFAULT now (),

        CONSTRAINT chk_share_target CHECK (
            album_id IS NOT NULL OR media_id IS NOT NULL
        )
    );

CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_share_links_album ON share_links (album_id);

COMMENT ON TABLE share_links IS 'Link chia sẻ công khai (kiểu Google Photos share link) — khác album_members ở chỗ người nhận KHÔNG cần có tài khoản trong hệ thống, chỉ cần link + token.';
COMMENT ON COLUMN share_links.token IS 'Chuỗi random duy nhất dùng trong URL public, vd gallery.app/s/{token}. Phải random đủ dài để không đoán được (tránh brute-force truy cập trái phép).';
COMMENT ON COLUMN share_links.album_id IS 'Chia sẻ nguyên 1 album. Loại trừ lẫn nhau về mặt logic với media_id (thường chỉ set 1 trong 2, ràng buộc chk_share_target chỉ yêu cầu ít nhất 1 cái có giá trị).';
COMMENT ON COLUMN share_links.media_id IS 'Chia sẻ 1 file lẻ, không phải cả album.';


-- ==========================================================
-- FRIENDSHIPS — vòng bạn bè, quyết định ai xem được moment của ai
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS friendships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        requester_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        addressee_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,

        status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'blocked'

        created_at TIMESTAMPTZ DEFAULT now (),
        responded_at TIMESTAMPTZ,

        UNIQUE (requester_id, addressee_id),
        CONSTRAINT chk_no_self_friend CHECK (requester_id <> addressee_id)
    );

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id);

COMMENT ON TABLE friendships IS 'Vòng bạn bè giữa 2 user, dùng để quyết định ai thấy moment của ai (visibility = circle). Quan hệ 2 chiều được lưu 1 row duy nhất (không lưu 2 lần A-B và B-A).';
COMMENT ON COLUMN friendships.requester_id IS 'Người gửi lời mời kết bạn.';
COMMENT ON COLUMN friendships.addressee_id IS 'Người nhận lời mời. Khi FE query "bạn bè của tôi", phải check cả 2 chiều: WHERE (requester_id = :me OR addressee_id = :me) AND status = ''accepted''.';
COMMENT ON COLUMN friendships.status IS 'pending | accepted | blocked.';

-- ==========================================================
-- MOMENTS — chụp/quay khoảnh khắc kiểu Locket, gửi cho vòng bạn bè
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS moments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, -- người đăng

        -- Ảnh/video vừa chụp. BẮT BUỘC với template='single', NULL với
        -- template='duo_square'/'trio_wide' (ảnh nằm trong moment_collab).
        -- ON DELETE SET NULL: xoá vĩnh viễn ảnh → moment vẫn còn (caption,
        -- reaction, meme) và card hiện placeholder "Ảnh đã bị xoá".
        media_id UUID REFERENCES media (id) ON DELETE SET NULL,

        -- 'single' (1 ảnh dọc) | 'duo_square' (2 ảnh vuông) | 'trio_wide' (3 ảnh ngang)
        template VARCHAR(30) NOT NULL DEFAULT 'single',

        caption TEXT,
        visibility VARCHAR(20) NOT NULL DEFAULT 'circle', -- 'circle' (bạn bè) | 'public' | 'private'
        expires_at TIMESTAMPTZ, -- dự phòng: chưa dùng (story mode chưa implement)

        created_at TIMESTAMPTZ DEFAULT now (),

        CONSTRAINT chk_template_media CHECK (
            template = 'single'
            OR (template IN ('duo_square', 'trio_wide') AND media_id IS NULL)
        )
    );

CREATE INDEX IF NOT EXISTS idx_moments_user_id ON moments (user_id);
CREATE INDEX IF NOT EXISTS idx_moments_created_at ON moments (created_at);
CREATE INDEX IF NOT EXISTS idx_moments_user_created ON moments (user_id, created_at DESC);

COMMENT ON TABLE moments IS 'Khoảnh khắc chụp/quay nhanh gửi cho vòng bạn bè (kiểu Locket). single: tham chiếu đúng 1 media_id. duo_square/trio_wide: media_id NULL, ảnh nằm trong moment_collab (mỗi người 1 slot, connect thành 1 moment).';
COMMENT ON COLUMN moments.media_id IS 'Ảnh/video của moment single (duo/trio: NULL). ON DELETE SET NULL: xoá vĩnh viễn ảnh thì moment vẫn còn và card hiện "Ảnh đã bị xoá". Ảnh chỉ vào thùng rác (deleted_at) → moment tự ẩn khỏi feed.';
COMMENT ON COLUMN moments.template IS 'single = 1 ảnh dọc (cũ). duo_square = 2 ảnh vuông ghép ngang (2 người cùng chụp). trio_wide = 3 ảnh ngang (3 người). Draft chưa đủ slot tự huỷ sau 24h và không hiện ở feed.';
COMMENT ON COLUMN moments.visibility IS 'circle (chỉ bạn bè trong friendships) | private. public giữ lại cho dữ liệu cũ nhưng hiện xử lý như circle (chưa có feed công khai).';
COMMENT ON COLUMN moments.expires_at IS 'Dự phòng, chưa dùng (story mode chưa implement).';

-- ==========================================================
-- MOMENT_COLLAB — ảnh từng người trong moment template duo/trio
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS moment_collab (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
        slot_index INT NOT NULL CONSTRAINT chk_collab_slot_index CHECK (slot_index >= 0), -- 0-based: 0 = creator, 1, 2 = bạn được mời
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        media_id UUID REFERENCES media (id) ON DELETE SET NULL, -- NULL = chưa điền ảnh
        filled_at TIMESTAMPTZ, -- NULL = chưa filled (draft)
        created_at TIMESTAMPTZ DEFAULT now (),
        UNIQUE (moment_id, slot_index)
    );

CREATE INDEX IF NOT EXISTS idx_moment_collab_moment ON moment_collab (moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_collab_user ON moment_collab (user_id);

COMMENT ON TABLE moment_collab IS 'Slot ảnh từng người trong moment template (duo_square/trio_wide). Mỗi row = 1 người + 1 ô ảnh lắp vào template chung. self-fill: creator chiếm mọi slot. collab: vòng bạn được mời điền ảnh của họ.';
COMMENT ON COLUMN moment_collab.slot_index IS 'Vị trí slot trong template (0 = ảnh trái/trên, sau đó sang phải). Số lượng slot theo template được giữ ở tầng service (moments.collab.service.js::insertMomentSlots); DB chặn slot_index âm + trùng bằng CHECK/UNIQUE.';
COMMENT ON COLUMN moment_collab.media_id IS 'Ảnh/video người này chọn cho slot. NULL = slot trống (draft). ON DELETE SET NULL: xoá media tự động bỏ slot đó, moment trở về draft.';
COMMENT ON COLUMN moment_collab.filled_at IS 'Thời điểm slot được điền ảnh. NULL = đang chờ. Moment chỉ xuất hiện ở feed khi MỌI slot có filled_at.';

-- ==========================================================
-- MOMENT_REACTIONS — reaction bằng emoji
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS moment_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, -- người react

        reaction_emoji VARCHAR(10) NOT NULL,

        created_at TIMESTAMPTZ DEFAULT now (),

        UNIQUE (moment_id, user_id) -- 1 người chỉ react 1 lần / moment
    );

CREATE INDEX IF NOT EXISTS idx_moment_reactions_moment_id ON moment_reactions (moment_id);

COMMENT ON TABLE moment_reactions IS 'Reaction emoji theo moment kiểu Locket. UNIQUE(moment_id, user_id) nghĩa là 1 người chỉ react được 1 lần cho mỗi moment — đổi ý thì phải UPDATE record cũ, không insert thêm.';

-- ==========================================================
-- MOMENT_MEMES — meme bạn bè "thả" lên 1 moment (kiểu bình luận ảnh).
-- Hiện ở MẶT SAU thẻ moment khi lật (flip card): danh sách meme scroll
-- liên tục, mỗi meme = avatar người đăng + ảnh meme + caption tùy chọn.
-- Ảnh meme được render từ nguồn ngoài (memegen.link) bằng template + dòng
-- chữ do user nhập, rồi TẢI VỀ và lưu vào MinIO (image_object). Trình duyệt
-- chỉ tải qua endpoint có kiểm quyền của backend, không gọi thẳng memegen.
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS moment_memes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, -- người đăng meme

        image_url TEXT,          -- URL nguồn (memegen.link) — fallback cho meme cũ
        image_object TEXT,       -- object key trong MinIO: moments/<momentId>/memes/<memeId>.<ext>
        template_id VARCHAR(64), -- ID template trên nguồn meme dùng để render
        caption TEXT,            -- ghi chú thêm (tùy chọn)

        created_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_moment_memes_moment
    ON moment_memes (moment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moment_memes_user ON moment_memes (user_id);

COMMENT ON TABLE moment_memes IS 'Meme "thả" lên 1 moment — kiểu bình luận ảnh ở mặt sau thẻ khi lật. Mỗi row = 1 meme của 1 user trên 1 moment, gồm ảnh đã lưu ở MinIO + caption tùy chọn.';
COMMENT ON COLUMN moment_memes.image_url IS 'URL nguồn memegen.link lúc render — chỉ dùng làm fallback cho meme tạo trước khi lưu MinIO (image_object NULL).';
COMMENT ON COLUMN moment_memes.image_object IS 'Object key ảnh meme trong MinIO (moments/<momentId>/memes/<memeId>.<ext>). Backend stream qua GET /api/moments/:momentId/memes/:memeId/image (URL có chữ ký). NULL = meme cũ, đọc image_url.';
COMMENT ON COLUMN moment_memes.template_id IS 'ID template trên nguồn meme (memegen.link) dùng để render — để đối chiếu/ghi chú nguồn gốc meme.';
COMMENT ON COLUMN moment_memes.caption IS 'Ghi chú tùy chọn của người đăng hiển thị dưới ảnh meme. NULL = không có.';

-- ==========================================================
-- MEME_REACTIONS — Tim (❤️) của user trên 1 meme
-- ==========================================================
-- Mỗi row = 1 lần tim của 1 user trên 1 meme (PK đôi chống trùng → bấm tim
-- lần nữa là bỏ tim). Số lượng tim hiển thị ở phía ĐỐI DIỆN avatar khi lật
-- xem meme (tim + số lượng tối giản theo yêu cầu).
CREATE TABLE
    IF NOT EXISTS meme_reactions (
        meme_id UUID NOT NULL REFERENCES moment_memes (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now (),
        PRIMARY KEY (meme_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_meme_reactions_meme ON meme_reactions (meme_id);

COMMENT ON TABLE meme_reactions IS 'Tim (heart) của user trên 1 meme — mỗi row = 1 lần tim của 1 user (PK đôi chống trùng).';
COMMENT ON COLUMN meme_reactions.meme_id IS 'Meme được tim. Xóa meme → xóa luôn các tim (CASCADE).';
COMMENT ON COLUMN meme_reactions.user_id IS 'User tim meme. Xóa user → tim tự gỡ (CASCADE).';


-- ==========================================================
-- TRANSFERS — Gửi file (link/QR/mã cho khách + gửi thẳng bạn bè)
-- ==========================================================
-- Byte đi P2P (WebRTC DataChannel, STUN → TURN) giữa 2 trình duyệt; không được
-- thì relay qua server: người gửi mã hoá từng part 4 MiB (AES-GCM, khoá chỉ ở 2
-- đầu) → MinIO `transfers/<id>/<fileId>/<part>`, giữ 1 ngày, tối đa 5 GB/phiên.
-- Ảnh đã có trong thư viện: gửi bạn bè = server copy sang thư viện người nhận;
-- gửi qua link = người nhận tải bản gốc từ server.
-- Khớp backend/src/db/migrate.js + modules/transfers.
-- ==========================================================

CREATE TABLE
    IF NOT EXISTS transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        sender_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        kind VARCHAR(10) NOT NULL CHECK (kind IN ('link', 'direct')),
        token_hash CHAR(64) UNIQUE, -- sha256(token link/QR); token thật chỉ nằm trong link
        code VARCHAR(8), -- mã 6 ký tự nhập tay
        code_expires_at TIMESTAMPTZ, -- mã sống 10 phút
        max_receivers INT,
        expires_at TIMESTAMPTZ NOT NULL, -- now() + 1 ngày
        revoked_at TIMESTAMPTZ,
        purged_at TIMESTAMPTZ, -- đã xoá object relay
        created_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_transfers_sender ON transfers (sender_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_code ON transfers (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_expires ON transfers (expires_at) WHERE purged_at IS NULL;

COMMENT ON TABLE transfers IS 'Phiên gửi file. link = ai có link/QR/mã đều nhận (không cần đăng nhập); direct = gửi thẳng bạn bè.';
COMMENT ON COLUMN transfers.token_hash IS 'Chỉ lưu hash — token + khoá giải mã nằm trong #fragment của link, không bao giờ tới server.';

CREATE TABLE
    IF NOT EXISTS transfer_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        transfer_id UUID NOT NULL REFERENCES transfers (id) ON DELETE CASCADE,
        position INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        size BIGINT NOT NULL CHECK (size >= 0),
        mime VARCHAR(100) NOT NULL,
        media_id UUID REFERENCES media (id) ON DELETE SET NULL, -- NULL = file trên máy người gửi
        thumb TEXT, -- thumbnail ≤160px đã mã hoá (base64)
        relay_parts INT NOT NULL DEFAULT 0 -- số part đã lên relay
    );

CREATE INDEX IF NOT EXISTS idx_transfer_files_transfer ON transfer_files (transfer_id, position);

CREATE TABLE
    IF NOT EXISTS transfer_relay_parts (
        file_id UUID NOT NULL REFERENCES transfer_files (id) ON DELETE CASCADE,
        part INT NOT NULL,
        size INT NOT NULL, -- byte bản mã (part + 16 byte tag GCM)
        PRIMARY KEY (file_id, part)
    );

CREATE TABLE
    IF NOT EXISTS transfer_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        transfer_id UUID NOT NULL REFERENCES transfers (id) ON DELETE CASCADE,
        user_id TEXT REFERENCES "user" (id) ON DELETE CASCADE, -- bạn bè / user mở link
        guest_id VARCHAR(64), -- khách (id trình duyệt)
        access_hash CHAR(64) UNIQUE, -- token riêng của khách vào bằng mã 6 số
        display_name VARCHAR(100),
        wrapped_keys JSONB, -- khoá phiên bọc ECDH cho từng thiết bị của bạn bè
        status VARCHAR(12) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'receiving', 'done', 'failed', 'declined')),
        via VARCHAR(8) CHECK (via IN ('p2p', 'turn', 'relay', 'server', 'copy')),
        bytes BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now (),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_recipients_user ON transfer_recipients (transfer_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_recipients_guest ON transfer_recipients (transfer_id, guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_recipients_inbox ON transfer_recipients (user_id, created_at DESC) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN transfer_recipients.via IS 'Đường dữ liệu thực tế: p2p (trực tiếp) · turn (WebRTC qua TURN) · relay (server, mã hoá) · server (ảnh thư viện) · copy (server copy vào thư viện) — số liệu so sánh cho luận văn.';

CREATE TABLE
    IF NOT EXISTS user_device_keys (
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        device_id VARCHAR(64) NOT NULL,
        public_key JSONB NOT NULL, -- JWK ECDH P-256 (khoá riêng nằm trong IndexedDB)
        last_seen_at TIMESTAMPTZ DEFAULT now (),
        PRIMARY KEY (user_id, device_id)
    );


-- ==========================================================
-- MEDIA_EMBEDDINGS — vector CLIP cho semantic search (Phase AI)
-- ==========================================================
-- 1 row / 1 media ảnh. Embedding tạo bởi ai-service (OpenCLIP image encoder)
-- lúc upload (chạy nền) hoặc qua endpoint backfill cho ảnh cũ. Câu truy vấn
-- text được embed cùng model rồi so cosine (toán tử `<=>` của pgvector) để
-- tìm ảnh theo mô tả tự nhiên.
--
-- Cột embedding cố định 512 chiều (ViT-B-32 / laion2b_s34b_b79k). Đổi sang
-- model khác số chiều thì phải ALTER cột (hoặc thiết kế lại theo bảng/model).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE
    IF NOT EXISTS media_embeddings (
        media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        model VARCHAR(100) NOT NULL, -- vd 'ViT-B-32'
        embedding vector(512) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_media_embeddings_user
    ON media_embeddings (user_id);
-- HNSW cho ANN search theo cosine. Với dữ liệu nhỏ, Postgres vẫn dùng seq scan
-- nếu thấy rẻ hơn — index chỉ có lợi khi bảng lớn dần.
CREATE INDEX IF NOT EXISTS idx_media_embeddings_hnsw
    ON media_embeddings USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE media_embeddings IS 'Embedding CLIP (OpenCLIP) của từng ảnh — phục vụ semantic search. Mỗi media tối đa 1 embedding; xoá media thì embedding tự xoá theo (CASCADE).';
COMMENT ON COLUMN media_embeddings.model IS 'Tên model đã tạo embedding (vd ViT-B-32). Lưu lại để biết vector tương thích với text encoder nào khi search.';
COMMENT ON COLUMN media_embeddings.embedding IS 'Vector CLIP 512 chiều (đã chuẩn hoá L2). Query dùng 1 - (embedding <=> $query) để tính cosine similarity.';

-- ==========================================================
-- MEDIA_DINO_EMBEDDINGS — DINOv3 descriptor (ảnh tương tự)
-- ==========================================================
-- Tách bảng riêng với CLIP: DINOv3 chỉ có image encoder (không text), tối ưu
-- cho so khớp ảnh↔ảnh. Dùng cho mục "Ảnh tương tự" trong Lightbox.
CREATE TABLE
    IF NOT EXISTS media_dino_embeddings (
        media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        model VARCHAR(100) NOT NULL, -- vd 'dinov3-vits16-pretrain-lvd1689m'
        embedding vector(384) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_media_dino_embeddings_user
    ON media_dino_embeddings (user_id);
CREATE INDEX IF NOT EXISTS idx_media_dino_embeddings_hnsw
    ON media_dino_embeddings USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE media_dino_embeddings IS 'Descriptor DINOv3 (pooler_output/CLS) của từng ảnh — phục vụ tìm ảnh tương tự. Mỗi media tối đa 1 row; xoá media thì tự xoá theo (CASCADE).';
COMMENT ON COLUMN media_dino_embeddings.embedding IS 'Vector DINOv3 ViT-S/16 384 chiều (đã chuẩn hoá L2). Chỉ so với row cùng model.';

-- ==========================================================
-- MEDIA_EDITS — Chỉnh ảnh (basic edit, không phá huỷ)
-- ==========================================================
CREATE TABLE
    IF NOT EXISTS media_edits (
        media_id UUID PRIMARY KEY REFERENCES media (id) ON DELETE CASCADE,
        recipe JSONB NOT NULL, -- thông số chỉnh (exposure, contrast… — xem media.edit.schema.js)
        display_object TEXT NOT NULL, -- bản xem đã chỉnh (≤2048px WebP)
        thumbnail_object TEXT NOT NULL, -- 400px cover đã chỉnh
        thumbnail_small_object TEXT NOT NULL, -- 200px cover đã chỉnh
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
    );

COMMENT ON TABLE media_edits IS 'Chỉnh ảnh không phá huỷ (non-destructive): lưu công thức chỉnh + các bản resize đã chỉnh do trình duyệt render (WebGL). File gốc và bản resize gốc trên media KHÔNG đổi; xoá row = về ảnh gốc. AI (CLIP/YOLO/DINO) vẫn chạy trên ảnh gốc.';
COMMENT ON COLUMN media_edits.recipe IS 'Công thức chỉnh {v, exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, vignette} — mở lại editor sẽ khôi phục đúng các thanh trượt.';
COMMENT ON COLUMN media_edits.updated_at IS 'Lần lưu cuối — đưa vào URL thumbnail (v=…) để trình duyệt bỏ bản cache cũ (thumbnail trả immutable).';

-- ==========================================================
-- MEDIA_TAGS — Gắn tag nội dung (classification)
-- ==========================================================
-- 17 tag (ai-service bench/cls_taxonomy.py) chấm từ vector CLIP đã lưu: object
-- ← linear probe COCO, scene ← linear probe Places6, attribute ← CLIP zero-shot.
-- Lưu xác suất của MỌI tag cho mỗi ảnh (kể cả dưới ngưỡng) để UI đổi ngưỡng tự
-- do; ảnh "có" tag khi confidence >= threshold (ngưỡng tối ưu F1 khi train).
CREATE TABLE
    IF NOT EXISTS media_tags (
        media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        tag VARCHAR(40) NOT NULL, -- vd 'food', 'beach', 'night'
        confidence REAL NOT NULL, -- xác suất 0–1
        threshold REAL NOT NULL, -- ngưỡng của tag lúc chấm
        model VARCHAR(160) NOT NULL, -- vd 'coco-lp_clip · places6-lp_clip · attribute-zero-shot'
        created_at TIMESTAMPTZ DEFAULT now (),
        PRIMARY KEY (media_id, tag)
    );

CREATE INDEX IF NOT EXISTS idx_media_tags_user_tag
    ON media_tags (user_id, tag, confidence DESC);

COMMENT ON TABLE media_tags IS 'Xác suất 17 tag nội dung của từng ảnh (1 row / ảnh / tag). Xoá media thì tự xoá theo (CASCADE).';

-- ==========================================================
-- DEVELOPER_REQUESTS — Đăng ký & duyệt Developer Mode
-- ==========================================================
-- User bấm "Đăng ký Developer" → tạo 1 row status='pending'. Admin xem
-- danh sách và approve/reject. Chỉ khi status='approved' user mới được bật
-- Developer Mode (hiện tag + bounding box detection, công cụ nội bộ...).
-- Mỗi user tối đa 1 row (UNIQUE user_id); đăng ký lại sau khi bị reject thì
-- UPDATE về 'pending' chứ không tạo row mới.
CREATE TABLE
    IF NOT EXISTS developer_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id TEXT UNIQUE NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected')),
        message TEXT,
        reviewed_by TEXT REFERENCES "user" (id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE INDEX IF NOT EXISTS idx_developer_requests_status
    ON developer_requests (status);

COMMENT ON TABLE developer_requests IS 'Yêu cầu bật Developer Mode. User tự đăng ký (status=pending), admin duyệt approve/reject. Chỉ approved mới bật được Developer Mode.';
COMMENT ON COLUMN developer_requests.status IS 'pending | approved | rejected. Approved = user được phép bật Developer Mode.';
COMMENT ON COLUMN developer_requests.reviewed_by IS 'Admin đã duyệt (FK "user".id). NULL khi còn pending hoặc admin đã bị xoá.';

-- ==========================================================
-- MEDIA_DETECTIONS — kết quả YOLO26 object detection (Phase AI)
-- ==========================================================
-- 1 ảnh có thể có NHIỀU detection (nhiều object). Mỗi detection lưu class
-- (COCO 80), confidence và bounding box chuẩn hoá 0–1. YOLO chạy lúc upload
-- (nền) hoặc qua backfill script. Search theo class_name (JOIN media).
-- Bbox luôn được lưu; client chỉ VẼ box khi bật Developer Mode.
CREATE TABLE
    IF NOT EXISTS media_detections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        class_name VARCHAR(80) NOT NULL, -- COCO class, vd 'person', 'dog'
        confidence REAL NOT NULL,
        -- [x1, y1, x2, y2] chuẩn hoá 0–1 theo kích thước ảnh gốc.
        bbox REAL[] NOT NULL,
        model VARCHAR(100) NOT NULL, -- vd 'yolo26n'
        created_at TIMESTAMPTZ DEFAULT now (),
        UNIQUE (media_id, model, class_name, confidence, bbox)
    );

CREATE INDEX IF NOT EXISTS idx_media_detections_user_class
    ON media_detections (user_id, class_name);
CREATE INDEX IF NOT EXISTS idx_media_detections_media
    ON media_detections (media_id);

-- Cột đánh dấu ảnh đã chạy YOLO xong (kể cả khi không có object nào). Dùng cho
-- backfill: ảnh có detection hoặc đã chạy nhưng 0 object đều không xử lý lại.
ALTER TABLE media ADD COLUMN IF NOT EXISTS yolo_processed_at TIMESTAMPTZ;
COMMENT ON COLUMN media.yolo_processed_at IS 'Thời điểm ảnh chạy xong YOLO object detection (NULL = chưa chạy). Khác với việc có detection hay không — ảnh không có object vẫn được set để backfill không lặp vô hạn.';

COMMENT ON TABLE media_detections IS 'Object detection YOLO26 trên từng ảnh — phục vụ search theo đối tượng và hiển thị tag/bbox (Developer Mode). Xoá media → detection tự xoá (CASCADE).';
COMMENT ON COLUMN media_detections.class_name IS 'Tên class COCO (80 class) do YOLO trả về, vd person/dog/car.';
COMMENT ON COLUMN media_detections.bbox IS 'Bounding box [x1,y1,x2,y2] đã chuẩn hoá 0–1 để client scale theo ảnh hiển thị.';
COMMENT ON COLUMN media_detections.model IS 'Model tạo ra detection (vd yolo26n). Đổi model thì backfill lại và có thể filter theo model.';

-- ==========================================================
-- GHI CHÚ CHO PHASE AI CÒN LẠI (làm sau, KHÔNG chạy phần này bây giờ)
-- ==========================================================
-- Các bảng video-frame / dedup (media_frames, media_object_tracks) và cột
-- trạng thái pipeline (frame_extract_status, dino_status, cluster_id) sẽ
-- thêm ở phase sau bằng ALTER TABLE riêng — không đụng tới các bảng trên:
--
-- ALTER TABLE media ADD COLUMN frame_extract_status VARCHAR(30) DEFAULT 'not_applicable';
-- ALTER TABLE media ADD COLUMN dino_status VARCHAR(30) DEFAULT 'pending';
-- ALTER TABLE media ADD COLUMN cluster_id VARCHAR(100);
-- -- rồi tạo thêm media_frames / media_object_tracks.
-- ── Nhãn cá nhân (trang Yêu thích) ─────────────────────────────────────
-- Do người dùng tự đặt ("Cần chỉnh sửa", "In ảnh"…), độc lập với
-- media.is_favorite. Trang Yêu thích = ảnh có tim HOẶC có nhãn.
CREATE TABLE
    IF NOT EXISTS user_labels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
        name VARCHAR(40) NOT NULL,
        color VARCHAR(16) NOT NULL DEFAULT 'slate', -- key bảng màu FE
        position INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now ()
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_labels_name ON user_labels (user_id, lower(name));

CREATE TABLE
    IF NOT EXISTS media_user_labels (
        label_id UUID NOT NULL REFERENCES user_labels (id) ON DELETE CASCADE,
        media_id UUID NOT NULL REFERENCES media (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now (),
        PRIMARY KEY (label_id, media_id)
    );

CREATE INDEX IF NOT EXISTS idx_media_user_labels_media ON media_user_labels (media_id);

-- Đã tạo bộ nhãn gợi ý cho user (xoá hết nhãn cũng không tạo lại).
CREATE TABLE
    IF NOT EXISTS user_label_seeds (
        user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now ()
    );
