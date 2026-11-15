// Danh mục 17 tag nội dung — cùng id/nhóm với ai-service app/tagging/taxonomy.py
// (tên hiển thị ở i18n `studio.tags.<id>`). Đổi taxonomy thì sửa cả 2 nơi.
// 174 nhãn chi tiết ("oi.*") KHÔNG liệt kê ở đây: danh mục + tên vi/en/ja lấy
// từ API (`useTagCatalog`); chỉ icon của 15 nhóm (section) nằm ở dưới.
import {
  Bird,
  Building2,
  Car,
  CloudSun,
  Cpu,
  FileText,
  Landmark,
  type LucideIcon,
  Moon,
  Mountain,
  Music,
  PartyPopper,
  PawPrint,
  Shirt,
  Sofa,
  Sunset,
  Trees,
  Trophy,
  UserRound,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";

export type TagGroup = "object" | "scene" | "attribute";

export const TAG_GROUPS: { group: TagGroup; tags: string[] }[] = [
  {
    group: "object",
    tags: [
      "portrait",
      "group",
      "pets",
      "animals",
      "food",
      "vehicles",
      "sports",
    ],
  },
  {
    group: "scene",
    tags: ["beach", "mountain", "nature", "street", "architecture", "indoor"],
  },
  { group: "attribute", tags: ["night", "sunset", "event", "document"] },
];

export const TAG_ICONS: Record<string, LucideIcon> = {
  portrait: UserRound,
  group: Users,
  pets: PawPrint,
  animals: Bird,
  food: UtensilsCrossed,
  vehicles: Car,
  sports: Trophy,
  beach: Waves,
  mountain: Mountain,
  nature: Trees,
  street: Building2,
  architecture: Landmark,
  indoor: Sofa,
  night: Moon,
  sunset: Sunset,
  event: PartyPopper,
  document: FileText,
};

export const isKnownTag = (tag: string | null): tag is string =>
  tag !== null && tag in TAG_ICONS;

// Nhóm hiển thị của nhãn chi tiết — id khớp SECTIONS (ai-service app/tagging/labels.py),
// tên ở i18n `studio.sections.<id>`.
export const SECTION_ICONS: Record<string, LucideIcon> = {
  people: Users,
  animals: PawPrint,
  food: UtensilsCrossed,
  nature: Trees,
  beach: Waves,
  sky: CloudSun,
  city: Building2,
  architecture: Landmark,
  vehicles: Car,
  sports: Trophy,
  events: Music,
  home: Sofa,
  tech: Cpu,
  fashion: Shirt,
  documents: FileText,
};
