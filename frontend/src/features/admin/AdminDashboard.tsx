import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Code2,
  Film,
  HardDrive,
  Image as ImageIcon,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminQueryKeys,
  fetchAdminOverview,
  fetchAdminSystem,
} from "@/services/admin";
import { formatBytes } from "@/utils/format";
import { AdminActivityChart } from "./components/AdminActivityChart";
import { AdminAiStatusCard } from "./components/AdminAiStatusCard";
import { AdminPageHeader } from "./components/AdminPageHeader";
import { AdminStatGrid } from "./components/AdminStatGrid";
import { UserCell } from "./components/UserCell";
import { formatRelative } from "@/utils/format";

/** /admin — số liệu nhanh, hoạt động 30 ngày, hệ thống AI, người dùng mới. */
export function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const overview = useQuery({
    queryKey: adminQueryKeys.overview,
    queryFn: fetchAdminOverview,
  });
  const system = useQuery({
    queryKey: adminQueryKeys.system,
    queryFn: fetchAdminSystem,
    refetchInterval: 30_000,
  });
  const kpi = overview.data?.kpi;

  if (overview.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        {t("admin.error.loadFailed")}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminPageHeader title={t("admin.nav.dashboard")} subtitle={t("admin.overviewDesc")} />

      <AdminStatGrid
        loading={!kpi}
        stats={[
          { key: "users", icon: Users, label: t("admin.kpi.users"), value: kpi?.users, to: "/admin/users" },
          { key: "new", icon: UserPlus, label: t("admin.kpi.newUsers"), value: kpi?.newUsers },
          { key: "photos", icon: ImageIcon, label: t("admin.kpi.photos"), value: kpi?.photos },
          { key: "videos", icon: Film, label: t("admin.kpi.videos"), value: kpi?.videos },
          {
            key: "storage",
            icon: HardDrive,
            label: t("admin.kpi.storage"),
            value: kpi ? formatBytes(kpi.storageBytes) : null,
          },
          {
            key: "requests",
            icon: Code2,
            label: t("admin.kpi.pendingRequests"),
            value: kpi?.pendingRequests,
            to: "/admin/developer",
            highlight: (kpi?.pendingRequests ?? 0) > 0,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {overview.data ? (
            <AdminActivityChart data={overview.data.activity} />
          ) : (
            <Skeleton className="h-80 rounded-xl bg-muted/40" />
          )}
        </div>
        <AdminAiStatusCard system={system.data} />
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="font-mono text-xs font-normal tracking-widest text-muted-foreground uppercase">
            {t("admin.recentUsers")}
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/users">
              {t("admin.viewAll")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/60">
            {(overview.data?.recentUsers ?? []).map((user) => (
              <li key={user.id}>
                <Link
                  to={`/admin/users?user=${encodeURIComponent(user.id)}`}
                  className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40"
                >
                  <UserCell
                    name={user.name}
                    email={user.email}
                    image={user.image}
                    className="flex-1"
                  />
                  {user.role === "admin" && <Badge>{t("admin.role.admin")}</Badge>}
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {formatRelative(user.createdAt, i18n.language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
