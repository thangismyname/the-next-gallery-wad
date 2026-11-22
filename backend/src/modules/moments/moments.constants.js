// Hằng số + đoạn SQL dùng chung cho các service moments.

// Số reaction bubble tối đa hiển thị trên 1 moment (FE render chồng từ trái sang).
export const MAX_REACTION_BUBBLES = 4;

// Số meme tối đa trên 1 moment (chống spam, P3.17).
export const MAX_MEMES_PER_MOMENT = 30;

// Fallback templates khi memegen.link không khả dụng (P3.12).
export const MEME_FALLBACK_TEMPLATES = [
  { id: "drake", name: "Drake", lines: 2, blankUrl: "https://api.memegen.link/images/drake.jpg" },
  { id: "distracted", name: "Distracted Boyfriend", lines: 3, blankUrl: "https://api.memegen.link/images/distracted.jpg" },
  { id: "fine", name: "This is Fine", lines: 2, blankUrl: "https://api.memegen.link/images/fine.jpg" },
  { id: "change", name: "Change My Mind", lines: 1, blankUrl: "https://api.memegen.link/images/change.jpg" },
  { id: "buzz", name: "Buzz Lightyear", lines: 2, blankUrl: "https://api.memegen.link/images/buzz.jpg" },
];

// Số slot mỗi template (0-based index: 0..n-1)
export const COLLAB_SLOT_COUNT = {
  single: 1,
  duo_square: 2,
  trio_wide: 3,
};

// Draft collab chưa đủ slot tự huỷ sau 24h, không hiện ở feed.
export const DRAFT_TTL = "24 hours";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// 1 slot coi là ĐÃ ĐIỀN chỉ khi có filled_at VÀ ảnh còn tồn tại (không ở thùng
// rác). `alias` = alias của moment_collab trong truy vấn đang dùng — ảnh bị xoá
// vĩnh viễn (SET NULL) hoặc bị đưa vào thùng rác thì slot quay về trạng thái
// trống (P2.6).
export const slotFilledSql = (alias = "mc") => `(
  ${alias}.filled_at IS NOT NULL
  AND ${alias}.media_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM media sm
    WHERE sm.id = ${alias}.media_id AND sm.deleted_at IS NULL
  )
)`;

// Cột chung cho toàn bộ truy vấn moment — join media + user info.
// media LEFT JOIN vì template duo/trio có media_id = NULL (ảnh nằm trong moment_collab).
// meme_count: correlated subquery (index moment_memes(moment_id)) — gộp vào
// query chính để feed không phải chạy thêm 1 round-trip (P2.8).
export const MOMENT_JOIN = `
    SELECT m.id, m.user_id, m.caption, m.visibility, m.created_at, m.template, m.framing,
           m.media_id, med.media_type, med.width, med.height, med.duration_seconds,
           u.name AS user_name, u.image AS user_avatar,
           (SELECT COUNT(*)::int FROM moment_memes mm
             WHERE mm.moment_id = m.id) AS meme_count
    FROM moments m
    LEFT JOIN media med ON med.id = m.media_id AND med.deleted_at IS NULL
    JOIN "user" u ON u.id = m.user_id
`;

// Chỉ hiện moment "hoàn chỉnh": single luôn đủ; duo/trio chỉ hiện khi MỌI slot đã
// filled bằng ảnh còn tồn tại (slot mất ảnh → moment về draft, không vào feed).
export const COMPLETED_FILTER = `
    AND (
      m.template = 'single'
      OR NOT EXISTS (
        SELECT 1 FROM moment_collab mc
        WHERE mc.moment_id = m.id AND NOT ${slotFilledSql("mc")}
      )
    )
`;

// Moment single chỉ hiện khi ảnh của nó KHÔNG nằm trong thùng rác (P2.6).
// Ảnh bị xoá vĩnh viễn → media_id = NULL (ON DELETE SET NULL) → vẫn hiện với
// placeholder "Ảnh đã bị xoá", không biến mất im lặng.
export const SINGLE_MEDIA_VISIBLE = `
    (m.template <> 'single'
     OR m.media_id IS NULL
     OR EXISTS (
       SELECT 1 FROM media sm
       WHERE sm.id = m.media_id AND sm.deleted_at IS NULL
     ))
`;
