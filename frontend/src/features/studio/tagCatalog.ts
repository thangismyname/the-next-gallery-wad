// Danh mục 17 tag nội dung — cùng id/nhóm với ai-service bench/cls_taxonomy.py
// (tên hiển thị ở i18n `studio.tags.<id>`). Đổi taxonomy thì sửa cả 2 nơi.
import {
  Bird,
  Building2,
  Car,
  FileText,
  Landmark,
  type LucideIcon,
  Moon,
  Mountain,
  PartyPopper,
  PawPrint,
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
