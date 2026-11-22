import { useTranslation } from "react-i18next";
import { Code2, LayoutDashboard, SquareTerminal, Users } from "lucide-react";
import { WorkspaceSidebar } from "@/components/layout/workspace/WorkspaceSidebar";
import { useAdminDeveloperRequests } from "@/features/admin/developer/useAdminDeveloperRequests";

export function AdminSidebar() {
  const { t } = useTranslation();
  // Số yêu cầu Developer đang chờ → badge cạnh mục "Yêu cầu Developer".
  const { pending } = useAdminDeveloperRequests();
  return (
    <WorkspaceSidebar
      label={t("admin.badge")}
      storageKey="tng.adminSidebarWidth"
      switchTo={{ label: t("dev.switch"), icon: SquareTerminal, to: "/dev" }}
      items={[
        { label: t("admin.nav.dashboard"), icon: LayoutDashboard, to: "/admin", end: true },
        { label: t("admin.nav.users"), icon: Users, to: "/admin/users" },
        { label: t("admin.nav.developer"), icon: Code2, to: "/admin/developer", badge: pending.length },
      ]}
    />
  );
}
