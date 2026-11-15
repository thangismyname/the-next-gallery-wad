// Same ids / icons as web `frontend/src/features/studio/tagCatalog.ts` (17 content
// tags of ai-service app/tagging/taxonomy.py; names in i18n `studio.tags.<id>`).
// The 174 detailed labels ("oi.*") come from the API (`useTagCatalog`); only the
// icons of their 15 sections live here. Change the taxonomy → change all three.
import {
  Bird,
  Building2,
  Car,
  CloudSun,
  Cpu,
  FileText,
  Landmark,
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
  type LucideIcon,
} from "lucide-react-native";

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

export const isKnownTag = (tag: string | null): tag is string => tag !== null && tag in TAG_ICONS;

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

export type TagGroup = "object" | "scene" | "attribute";

/** The 17 categories by where their model comes from (web `TAG_GROUPS`; i18n `studio.groups.<group>`). */
export const TAG_GROUPS: { group: TagGroup; tags: string[] }[] = [
  { group: "object", tags: ["portrait", "group", "pets", "animals", "food", "vehicles", "sports"] },
  { group: "scene", tags: ["beach", "mountain", "nature", "street", "architecture", "indoor"] },
  { group: "attribute", tags: ["night", "sunset", "event", "document"] },
];

/** Lower-case without Vietnamese accents: "Thác nước" → "thac nuoc" (label filter). */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
