// Hằng số + đoạn SQL dùng chung cho các service moments.

// Số reaction bubble tối đa hiển thị trên 1 moment (FE render chồng từ trái sang).
export const MAX_REACTION_BUBBLES = 4;

// Số slot mỗi template (0-based index: 0..n-1)
export const COLLAB_SLOT_COUNT = {
  single: 1,
  duo_square: 2,
  trio_wide: 3,
};

// Draft collab chưa đủ slot tự huỷ sau 24h, không hiện ở feed.
export const DRAFT_TTL = "24 hours";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Cột chung cho toàn bộ truy vấn moment — join media + user info.
// media LEFT JOIN vì template duo/trio có media_id = NULL (ảnh nằm trong moment_collab).
export const MOMENT_JOIN = `
    SELECT m.id, m.user_id, m.caption, m.visibility, m.created_at, m.template,
           m.media_id, med.media_type, med.width, med.height, med.duration_seconds,
           u.name AS user_name, u.image AS user_avatar
    FROM moments m
    LEFT JOIN media med ON med.id = m.media_id AND med.deleted_at IS NULL
    JOIN "user" u ON u.id = m.user_id
`;

// Chỉ hiện moment "hoàn chỉnh": single luôn đủ; duo/trio chỉ hiện khi MỌI slot đã filled.
export const COMPLETED_FILTER = `
    AND (
      m.template = 'single'
      OR NOT EXISTS (
        SELECT 1 FROM moment_collab mc
        WHERE mc.moment_id = m.id AND mc.filled_at IS NULL
      )
    )
`;
