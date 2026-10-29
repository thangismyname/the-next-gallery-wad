import { LucideIcon } from "lucide-react";

export interface NavMenuItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Vị trí trên bottom bar mobile (0–4, 2 = nút Camera nổi ở giữa); không có = không hiện. */
  bottomBar?: number;
  /** Nhóm trên sidebar; "system" (Thùng rác) ghim dưới cùng. */
  section?: "photos" | "ai" | "social" | "system";
  badge?: number; // Số hiển thị trên item (vd lời mời moment)
}

export interface Category {
  id: string;
  label: string;
  description?: string;
  href: string;
  coverUrl?: string;
  itemCount?: number;
}