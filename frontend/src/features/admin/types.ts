import type { LucideIcon } from "lucide-react";

export interface AdminNavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}
