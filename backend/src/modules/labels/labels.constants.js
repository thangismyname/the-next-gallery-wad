// Key màu nhãn — FE map sang class (features/favorites/labelColors.ts). Đổi
// danh sách thì đổi cả 2 nơi.
export const LABEL_COLORS = ["slate", "rose", "amber", "emerald", "sky", "violet"];
export const MAX_LABELS = 30;

// Nhãn gợi ý lưu theo KEY (user_labels.preset, name = NULL) → FE hiện tên theo
// ngôn ngữ đang dùng (i18n favorites.labels.suggested.<key>). User đổi tên →
// name = chữ của user (không dịch nữa). `names` = tên ở mọi ngôn ngữ — để chặn
// tạo nhãn trùng tên nhãn gợi ý, và chuyển các dòng cũ đã lưu chữ sang key.
// Đổi tên ở đây thì đổi cả locales/*/translation.json.
export const LABEL_PRESETS = {
  edit: { color: "amber", names: ["Cần chỉnh sửa", "To edit", "編集する"] },
  print: { color: "sky", names: ["In ảnh", "To print", "プリントする"] },
  family: { color: "emerald", names: ["Gửi gia đình", "Send to family", "家族に送る"] },
  post: { color: "rose", names: ["Đăng mạng xã hội", "To post", "SNSに投稿"] },
  avatar: { color: "violet", names: ["Làm ảnh đại diện", "Profile picture", "プロフィール写真"] },
};
/** Tạo sẵn cho user mới (các key còn lại chỉ để hiển thị dòng cũ). */
export const SEED_PRESETS = ["edit", "print", "family"];
export const MAX_MEDIA_PER_REQUEST = 500;
