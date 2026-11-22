import { ChartColumn, UserCheck, Users } from "lucide-react-native";

import { AppTabs } from "@/features/navigation/AppTabs";

import { useAdminDeveloperRequests } from "./useAdmin";

/**
 * Admin workspace (`/admin`, admins only — the API is `requireAdmin` anyway): the app's tab bar (`AppTabs`)
 * with the web admin's pages — Users · **Overview (middle)** · Developer requests (pending badge = web
 * sidebar badge). The switch to the Developer workspace is a button on the Overview page.
 * `backBehavior="none"` → back leaves the workspace.
 */
export function AdminTabs() {
  const pending = useAdminDeveloperRequests().requests.filter((r) => r.status === "pending").length;
  return (
    <AppTabs
      backBehavior="none"
      tabs={[
        { name: "users", labelKey: "admin.nav.users", sf: "person.2", md: "group", icon: Users },
        { name: "index", labelKey: "admin.nav.dashboard", sf: "chart.bar", md: "bar_chart", icon: ChartColumn },
        { name: "developer", labelKey: "admin.nav.developer", sf: "person.badge.key", md: "how_to_reg", icon: UserCheck, badge: pending },
      ]}
    />
  );
}
