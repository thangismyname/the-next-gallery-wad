import { adminQueryKeys } from "@tng/shared";
import { router } from "expo-router";
import { SquareTerminal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { WorkspaceScreen, WorkspaceSwitchButton } from "@/components/shared/WorkspaceScreen";

import { DeveloperTab } from "./components/DeveloperTab";
import { OverviewTab } from "./components/OverviewTab";
import { UsersTab } from "./components/UsersTab";

/** Admin tab pages (`/admin`, `/admin/users`, `/admin/developer`) = web `AdminDashboard` · `AdminUsersView` · `AdminDeveloperView`. */
export function AdminOverviewScreen() {
  const { t } = useTranslation();
  return (
    <WorkspaceScreen title={t("header.admin")} subtitle={t("admin.overviewDesc")} refreshKey={adminQueryKeys.all}>
      <WorkspaceSwitchButton to="/dev" icon={SquareTerminal} label={t("dev.switch")} />
      <OverviewTab onTab={(tab) => router.navigate(tab === "users" ? "/admin/users" : "/admin/developer")} />
    </WorkspaceScreen>
  );
}

export function AdminUsersScreen() {
  const { t } = useTranslation();
  return (
    <WorkspaceScreen title={t("admin.nav.users")} refreshKey={adminQueryKeys.all} keyboard>
      <UsersTab />
    </WorkspaceScreen>
  );
}

export function AdminDeveloperScreen() {
  const { t } = useTranslation();
  return (
    <WorkspaceScreen title={t("admin.nav.developer")} refreshKey={adminQueryKeys.all} keyboard>
      <DeveloperTab />
    </WorkspaceScreen>
  );
}
