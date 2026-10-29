"""Bộ danh mục (taxonomy) gắn tag cho gallery — 17 tag, 3 nhóm.

Mỗi tag có:
  vi / en       tên hiển thị
  group         "object" (suy từ object, nhãn GT từ COCO) | "scene" (cảnh, GT từ
                Places365) | "attribute" (thuộc tính, GT chỉ từ tập tự gán nhãn)
  definition    định nghĩa để gán nhãn nhất quán (dùng cho cả người và luật COCO)
  prompts       câu mô tả cho CLIP zero-shot (prompt ensembling: lấy trung bình)
  negatives     câu "không phải tag này" cho zero-shot nhị phân (bỏ trống → GENERIC)
  coco          luật suy nhãn từ annotation COCO (chỉ nhóm object)
  places        loại cảnh Places365 thuộc tag (chỉ nhóm scene; tên đúng như
                categories_places365.txt)

Sửa tag ở đây là đủ — bench, pre-label và (sau này) app đều đọc file này.
Đổi danh mục thì tăng TAXONOMY_VERSION để cache/nhãn cũ không bị lẫn.
"""
from __future__ import annotations

TAXONOMY_VERSION = "2026-10-24.1"

# Câu "phủ định" chung cho zero-shot nhị phân: p(tag) = softmax([sim(tag), sim(generic)]).
GENERIC_NEGATIVES = [
    "a photo.",
    "a random everyday photo.",
    "a photo of something.",
]

# Ngưỡng cho luật COCO (tỉ lệ diện tích bbox / diện tích ảnh).
PORTRAIT_MIN_PERSON_AREA = 0.20  # người lớn nhất chiếm ≥20% ảnh
GROUP_MIN_PERSONS = 3
ANIMAL_MIN_AREA = 0.02
FOOD_MIN_TOTAL_AREA = 0.05
VEHICLE_MIN_AREA = 0.05

TAGS: list[dict] = [
    # ── Theo đối tượng (GT: COCO val2017) ─────────────────────────────────
    {
        "id": "portrait", "vi": "Chân dung", "en": "Portrait", "group": "object",
        "definition": "1–2 người là chủ thể chính; người lớn nhất chiếm ≥20% diện tích ảnh.",
        "prompts": ["a portrait photo of a person.", "a close-up photo of a person's face.",
                    "a selfie.", "a photo of one person posing for the camera."],
        "coco": {"rule": "portrait"},
    },
    {
        "id": "group", "vi": "Nhóm người", "en": "Group of people", "group": "object",
        "definition": "Từ 3 người trở lên cùng xuất hiện (hoặc một đám đông).",
        "prompts": ["a photo of a group of people.", "a group photo of friends.",
                    "a photo of a crowd of people.", "a photo of many people together."],
        "coco": {"rule": "group"},
    },
    {
        "id": "pets", "vi": "Thú cưng", "en": "Pets", "group": "object",
        "definition": "Có chó hoặc mèo rõ ràng (chiếm ≥2% ảnh).",
        "prompts": ["a photo of a pet.", "a photo of a dog.", "a photo of a cat.",
                    "a photo of my pet at home."],
        "coco": {"rule": "any", "classes": ["cat", "dog"], "min_area": ANIMAL_MIN_AREA},
    },
    {
        "id": "animals", "vi": "Động vật", "en": "Animals", "group": "object",
        "definition": "Động vật không phải chó/mèo: chim, ngựa, bò, cừu, voi, gấu, ngựa vằn, hươu cao cổ.",
        "prompts": ["a photo of a wild animal.", "a photo of farm animals.",
                    "a photo of a bird.", "a photo of animals in the zoo."],
        "coco": {"rule": "any", "classes": ["bird", "horse", "sheep", "cow", "elephant",
                                             "bear", "zebra", "giraffe"], "min_area": ANIMAL_MIN_AREA},
    },
    {
        "id": "food", "vi": "Đồ ăn", "en": "Food", "group": "object",
        "definition": "Món ăn/đồ ăn là nội dung chính (tổng diện tích đồ ăn ≥5% ảnh).",
        "prompts": ["a photo of food.", "a photo of a meal on a plate.", "a photo of a dish.",
                    "a close-up photo of delicious food."],
        "coco": {"rule": "total_area", "classes": ["banana", "apple", "sandwich", "orange",
                                                    "broccoli", "carrot", "hot dog", "pizza",
                                                    "donut", "cake"], "min_area": FOOD_MIN_TOTAL_AREA},
    },
    {
        "id": "vehicles", "vi": "Phương tiện", "en": "Vehicles", "group": "object",
        "definition": "Xe/tàu/máy bay là chủ thể rõ (phương tiện lớn nhất chiếm ≥5% ảnh).",
        "prompts": ["a photo of a car.", "a photo of a vehicle.", "a photo of a motorbike.",
                    "a photo of a train, bus or airplane."],
        "coco": {"rule": "any", "classes": ["bicycle", "car", "motorcycle", "airplane", "bus",
                                             "train", "truck", "boat"], "min_area": VEHICLE_MIN_AREA},
    },
    {
        "id": "sports", "vi": "Thể thao", "en": "Sports", "group": "object",
        "definition": "Đang chơi thể thao / có dụng cụ thể thao (bóng, ván trượt, vợt…).",
        "prompts": ["a photo of people playing sports.", "a photo of a sports game.",
                    "a photo of someone skateboarding or surfing.", "a photo of a ball game."],
        "coco": {"rule": "any", "classes": ["frisbee", "skis", "snowboard", "sports ball", "kite",
                                             "baseball bat", "baseball glove", "skateboard",
                                             "surfboard", "tennis racket"], "min_area": 0.0},
    },
    # ── Theo cảnh (GT: Places365 val) ─────────────────────────────────────
    {
        "id": "beach", "vi": "Biển", "en": "Beach & sea", "group": "scene",
        "definition": "Bãi biển, bờ biển, mặt biển, đảo.",
        "prompts": ["a photo of a beach.", "a photo of the sea.", "a photo of the ocean coast.",
                    "a seaside photo."],
        "places": ["/b/beach", "/c/coast", "/o/ocean", "/l/lagoon", "/i/islet", "/w/wave"],
    },
    {
        "id": "mountain", "vi": "Núi", "en": "Mountains", "group": "scene",
        "definition": "Núi, đồi, thung lũng, vách đá, núi tuyết.",
        "prompts": ["a photo of mountains.", "a photo of a mountain landscape.",
                    "a photo of a valley.", "a photo of snowy mountains."],
        "places": ["/m/mountain", "/m/mountain_path", "/m/mountain_snowy", "/v/valley",
                   "/c/canyon", "/c/cliff", "/v/volcano", "/b/butte", "/g/glacier"],
    },
    {
        "id": "nature", "vi": "Thiên nhiên", "en": "Nature", "group": "scene",
        "definition": "Rừng, sông, hồ, thác, cánh đồng hoang, đầm lầy (không có núi/biển là chính).",
        "prompts": ["a photo of a forest.", "a photo of nature.", "a photo of a river or lake.",
                    "a photo of a waterfall."],
        "places": ["/f/forest/broadleaf", "/f/forest_path", "/r/rainforest", "/b/bamboo_forest",
                   "/f/field/wild", "/m/marsh", "/l/lake/natural", "/r/river", "/w/waterfall",
                   "/c/creek"],
    },
    {
        "id": "street", "vi": "Đường phố", "en": "Street & city", "group": "scene",
        "definition": "Đường phố, khu phố, quảng trường, chợ ngoài trời, cao tốc.",
        "prompts": ["a photo of a city street.", "a photo of a street.", "a photo of downtown.",
                    "a photo of an urban neighborhood."],
        "places": ["/s/street", "/d/downtown", "/a/alley", "/c/crosswalk", "/p/plaza",
                   "/r/residential_neighborhood", "/h/highway", "/m/market/outdoor", "/s/shopfront"],
    },
    {
        "id": "architecture", "vi": "Kiến trúc", "en": "Architecture", "group": "scene",
        "definition": "Công trình kiến trúc/địa danh là chủ thể: nhà thờ, chùa, lâu đài, tháp, cầu.",
        "prompts": ["a photo of a famous building.", "a photo of architecture.",
                    "a photo of a church, temple or castle.", "a photo of a landmark."],
        "places": ["/c/church/outdoor", "/c/castle", "/p/palace", "/t/temple/asia", "/p/pagoda",
                   "/m/mosque/outdoor", "/t/tower", "/s/skyscraper", "/b/bridge", "/r/ruin",
                   "/m/mausoleum", "/l/lighthouse"],
    },
    {
        "id": "indoor", "vi": "Trong nhà", "en": "Indoor", "group": "scene",
        "definition": "Không gian trong nhà: phòng khách, phòng ngủ, bếp, văn phòng, quán cà phê.",
        "prompts": ["a photo of a room indoors.", "a photo inside a house.",
                    "a photo of a living room.", "a photo of an office or a cafe."],
        "places": ["/l/living_room", "/b/bedroom", "/k/kitchen", "/d/dining_room", "/b/bathroom",
                   "/o/office", "/h/home_office", "/c/classroom", "/c/coffee_shop", "/c/corridor",
                   "/l/lobby", "/c/childs_room"],
    },
    # ── Thuộc tính / đặc biệt (GT: chỉ tập tự gán nhãn) ───────────────────
    {
        "id": "night", "vi": "Ban đêm", "en": "Night", "group": "attribute",
        "definition": "Chụp vào ban đêm / thiếu sáng (trời tối, đèn đường, đèn thành phố).",
        "prompts": ["a photo taken at night.", "a photo of a city at night.",
                    "a dark night-time photo.", "a photo of night lights."],
        "negatives": ["a photo taken during the day.", "a bright daytime photo."],
    },
    {
        "id": "sunset", "vi": "Hoàng hôn", "en": "Sunset / sunrise", "group": "attribute",
        "definition": "Hoàng hôn hoặc bình minh, bầu trời màu cam/hồng.",
        "prompts": ["a photo of a sunset.", "a photo of a sunrise.",
                    "a photo of an orange sky at dusk.", "a photo of the golden hour."],
        "negatives": ["a photo with a blue sky at noon.", "a photo taken at night."],
    },
    {
        "id": "event", "vi": "Sự kiện", "en": "Event & party", "group": "attribute",
        "definition": "Tiệc, sinh nhật, đám cưới, lễ hội, buổi hòa nhạc, tốt nghiệp.",
        "prompts": ["a photo of a party.", "a photo of a birthday celebration.",
                    "a photo of a wedding.", "a photo of a concert or festival."],
    },
    {
        "id": "document", "vi": "Tài liệu / màn hình", "en": "Document & screenshot", "group": "attribute",
        "definition": "Giấy tờ, hóa đơn, chữ viết, slide, ảnh chụp màn hình điện thoại/máy tính.",
        "prompts": ["a photo of a document.", "a screenshot of a phone screen.",
                    "a photo of a receipt or paper with text.", "a screenshot of a website."],
    },
]

TAG_IDS = [t["id"] for t in TAGS]
TAG_BY_ID = {t["id"]: t for t in TAGS}


def tags_in(group: str) -> list[str]:
    return [t["id"] for t in TAGS if t["group"] == group]


OBJECT_TAGS = tags_in("object")
SCENE_TAGS = tags_in("scene")
ATTRIBUTE_TAGS = tags_in("attribute")


def places_to_tag() -> dict[str, str]:
    """Tên cảnh Places365 → tag scene."""
    mapping: dict[str, str] = {}
    for tag in TAGS:
        for name in tag.get("places", []):
            if name in mapping:
                raise ValueError(f"{name} thuộc cả {mapping[name]} và {tag['id']}")
            mapping[name] = tag["id"]
    return mapping


def coco_tags_for(annotations: list[dict], width: int, height: int) -> set[str]:
    """Áp luật COCO cho 1 ảnh. `annotations`: [{category, area_frac, iscrowd}]."""
    found: set[str] = set()
    persons = [a for a in annotations if a["category"] == "person"]
    individual = [a for a in persons if not a["iscrowd"]]
    if len(individual) >= GROUP_MIN_PERSONS or any(a["iscrowd"] for a in persons):
        found.add("group")
    elif 1 <= len(individual) <= 2 and max(a["area_frac"] for a in individual) >= PORTRAIT_MIN_PERSON_AREA:
        found.add("portrait")

    for tag in TAGS:
        rule = tag.get("coco")
        if not rule or rule["rule"] in ("portrait", "group"):
            continue
        hits = [a for a in annotations if a["category"] in rule["classes"]]
        if not hits:
            continue
        if rule["rule"] == "total_area":
            ok = sum(a["area_frac"] for a in hits) >= rule["min_area"]
        else:
            ok = max(a["area_frac"] for a in hits) >= rule["min_area"]
        if ok:
            found.add(tag["id"])
    return found
