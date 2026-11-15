import { Code2, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import type { UserKind } from "@tng/shared";

/**
 * One color per account kind (admin = red · developer = amber · user = blue) for
 * card borders + a soft icon chip — same as mobile `features/admin/components/AdminUi.tsx`.
 */
export const KIND_STYLE: Record<UserKind, { icon: LucideIcon; border: string; accent: string; chip: string; label: string }> = {
  admin: {
    icon: ShieldCheck,
    border: "border-red-500/50",
    accent: "border-l-red-500",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    label: "admin.role.admin",
  },
  developer: {
    icon: Code2,
    border: "border-amber-500/50",
    accent: "border-l-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    label: "developer.title",
  },
  user: {
    icon: UserRound,
    border: "border-blue-500/40",
    accent: "border-l-blue-500",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    label: "admin.role.user",
  },
};
