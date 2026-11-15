export type MomentVisibility = "circle" | "public" | "private";

/** Template moment — quyết định cách ghép ảnh trong 1 moment. */
export type MomentTemplate = "single" | "duo_square" | "trio_wide";

/** 1 slot (1 người + ảnh của người đó) trong moment template duo/trio. */
export interface MomentSlot {
  slotIndex: number;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  mediaId: string | null;
  mediaType: "photo" | "video";
  thumbnailUrl: string | null;
  url: string | null;
  width: number;
  height: number;
  durationSeconds?: number | null;
  filled: boolean;
  /** Slot đã từng được điền nhưng ảnh đã bị xoá vĩnh viễn → hiện placeholder. */
  missing?: boolean;
  filledAt?: string | null;
}

/** Tổng hợp 1 loại reaction (emoji) trên 1 moment. */
export interface MomentReaction {
  emoji: string;
  count: number;
}

/** 1 reaction cụ thể (người + emoji) — dùng cho bubble 2 mặt chồng nhau. */
export interface MomentRecentReaction {
  emoji: string | null;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
}

/** 1 meme "thả" lên moment (mặt sau thẻ khi lật) — kiểu bình luận ảnh. */
export interface MomentMeme {
  id: string;
  momentId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  /** URL ảnh meme — đường dẫn stream đã ký (`/api/moments/.../image?exp&sig`). */
  imageUrl: string;
  /** ID template nguồn meme dùng để render. */
  templateId: string | null;
  /** Ghi chú thêm của người đăng (tùy chọn). */
  caption: string | null;
  createdAt: string;
  isOwn: boolean;
  /** Tổng số tim (❤️) mà meme đang có. */
  reactCount: number;
  /** Tôi đã tim meme này chưa. */
  myReact: boolean;
  /** Tên người đã tim (tối đa 3) — tooltip "ai đã tim". */
  reactNames: string[];
}

/** 1 template meme từ nguồn memegen.link (biến thể "meme"). */
export interface MemeTemplate {
  id: string;
  name: string;
  /** Số dòng chữ template hỗ trợ (1-3, đôi khi 5). */
  lines: number;
  /** URL ảnh gốc (chưa có chữ) dùng làm thumbnail preview. */
  blankUrl: string;
}

export interface Moment {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string | null;
  template: MomentTemplate;
  /** Danh sách slot (template duo/trio). single → []. */
  slots: MomentSlot[];
  mediaId: string | null;
  mediaType: "photo" | "video";
  caption: string | null;
  visibility?: MomentVisibility;
  /** Moment single mà ảnh đã bị xoá vĩnh viễn → card hiện placeholder. */
  missingMedia?: boolean;
  thumbnailUrl: string | null;
  /** Bản lớn cho màn retina (P3.8). */
  displayUrl?: string | null;
  /** Bản thumbnail nhỏ 200px (dropdown lời mời) — có thể thiếu ở dữ liệu cũ. */
  thumbSmallUrl?: string | null;
  url: string | null;
  width: number;
  height: number;
  durationSeconds?: number | null;
  createdAt: string;
  isOwn: boolean;
  /** Tôi có tham gia (có slot trong moment) nhưng không phải creator. */
  isParticipant?: boolean;
  /** Summary reactions (emoji + count), sắp theo count giảm dần. */
  reactions: MomentReaction[];
  /** Top-N reaction gần nhất (kèm user) — render bubble 2 mặt. */
  recentReactions: MomentRecentReaction[];
  /** Emoji mà user hiện tại đã react (null = chưa). */
  myReaction: string | null;
  /** Tổng số meme trên moment (hiện ở nút lật thẻ). */
  memeCount?: number;
  /** Invitation-only: slot index của tôi còn trống (null = tôi là creator đang chờ). */
  myPendingSlot?: number | null;
  /** Invitation-only: danh sách slot trống của tôi (1 người có thể giữ nhiều slot). */
  myPendingSlots?: number[];
  /** Invitation-only: số slot còn trống. */
  pendingCount?: number;
}

/** Trạng thái ngay sau khi react/remove — dùng cho UI tối ưu. */
export type ReactPayload = {
  emoji?: string;
};

/** Response từ listMomentsFeed — dùng cho infinite scroll. */
export interface MomentFeedResponse {
  items: Moment[];
  hasMore: boolean;
  limit: number;
  offset: number;
}