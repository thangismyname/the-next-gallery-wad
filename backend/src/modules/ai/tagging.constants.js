// Gắn tag nội dung — 2 tầng, cùng lưu trong bảng media_tags:
//  - 17 tag danh mục (id không có tiền tố, vd "pets") — taxonomy của ai-service
//    app/tagging/taxonomy.py; FE features/studio/tagCatalog.ts.
//  - 174 nhãn chi tiết Open Images (id "oi.<tên>", vd "oi.dog") — danh mục
//    app/tagging/labels.csv, tên vi/en/ja + nhóm lấy qua GET /tags/catalog.

// Nhãn chi tiết: chỉ lưu xác suất ≥ mức này (174 nhãn × mọi ảnh là quá nhiều
// dòng); vẫn thấp hơn hẳn mọi ngưỡng → UI kéo ngưỡng xuống vẫn có dữ liệu.
export const LABEL_STORE_MIN = 0.02;

// id tag hợp lệ (route params, smart album): danh mục hoặc nhãn chi tiết.
export const TAG_ID_RE = /^(oi\.)?[a-z_]{1,40}$/;

// Điều kiện SQL "chỉ tag danh mục" — cho chip trên ô ảnh, album tự động theo nội dung.
export const categoryTagSql = (alias = "t") => `${alias}.tag NOT LIKE 'oi.%'`;
