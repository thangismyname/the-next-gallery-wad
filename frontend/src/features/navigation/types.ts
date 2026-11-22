// UI-only nav types (lucide-react icons) — kept out of @tng/shared so the mobile
// bundle doesn't pull in the web icon library.
import type { LucideIcon } from "lucide-react";

export interface NavMenuItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Vị trí trên bottom bar mobile (0–4, 2 = nút Camera nổi ở giữa); không có = không hiện. */
  bottomBar?: number;
  /** Nhóm trên sidebar; "system" (Thùng rác) ghim dưới cùng. */
  section?: "photos" | "ai" | "social" | "system";
  badge?: number; // Số hiển thị trên item (vd lời mời moment)
  /** Chỉ sáng khi đúng đường dẫn (vd "/admin" không sáng ở /admin/users). */
  end?: boolean;
}
