// Hằng số module albums.

/** Vai trò trong album: owner (albums.user_id) | editor (thêm/gỡ ảnh của mình) | viewer. */
export const MEMBER_ROLES = ["editor", "viewer"];

/** Quyền của link công khai: chỉ xem | xem + tải về. */
export const LINK_PERMISSIONS = ["view", "download"];

// Album thông minh dạng truy vấn: tính lại mỗi lần mở → giới hạn số ảnh.
export const SMART_QUERY_LIMIT = 300;
// Album thông minh dạng tag: tối đa bấy nhiêu tag (AND).
export const SMART_MAX_TAGS = 3;

export const MAX_MEDIA_PER_REQUEST = 500;

// ── Album tự động (albums.auto.service.js) ────────────────────────────
export const AUTO_GROUPS = ["type", "content", "time", "objects"];
export const AUTO_TYPE_ORDER = ["type-photos", "type-videos", "type-screenshots", "type-favorites"];
// Sự kiện = chuỗi ảnh có ngày chụp cách nhau ≤ bấy nhiêu giờ, đủ bấy nhiêu ảnh.
export const AUTO_EVENT_GAP_HOURS = 3;
export const AUTO_EVENT_MIN_ITEMS = 5;

// 80 class COCO (YOLO) → 12 nhóm lớn (supercategory của COCO) = 12 album vật thể.
const SUPERCATEGORIES = {
  person: ["person"],
  vehicle: ["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"],
  outdoor: ["traffic light", "fire hydrant", "stop sign", "parking meter", "bench"],
  animal: [
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
  ],
  accessory: ["backpack", "umbrella", "handbag", "tie", "suitcase"],
  sports: [
    "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket",
  ],
  kitchen: ["bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl"],
  food: [
    "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut",
    "cake",
  ],
  furniture: ["chair", "couch", "potted plant", "bed", "dining table", "toilet"],
  electronic: ["tv", "laptop", "mouse", "remote", "keyboard", "cell phone"],
  appliance: ["microwave", "oven", "toaster", "sink", "refrigerator"],
  indoor: ["book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"],
};
/** class_name YOLO → nhóm lớn. */
export const COCO_SUPERCATEGORY = Object.fromEntries(
  Object.entries(SUPERCATEGORIES).flatMap(([group, classes]) => classes.map((c) => [c, group])),
);
