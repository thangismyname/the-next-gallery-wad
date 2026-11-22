import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FlaskConical, PlayCircle, ShieldCheck } from "lucide-react";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MediaPickerHost } from "@/features/media-picker/MediaPickerHost";
import { WorkspaceHeader } from "@/components/layout/workspace/WorkspaceHeader";
import { WorkspaceSidebar } from "@/components/layout/workspace/WorkspaceSidebar";
import { useSession } from "@/services/authClient";
import { DevSearch } from "@/features/lab/DevSearch";

/** Khu Developer (/dev/*): cùng khung với Admin. Thêm công cụ dev = thêm 1 mục + 1 route. */
export function DevLayout() {
  const { t } = useTranslation();
  const isAdmin = useSession().data?.user.role === "admin";
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full flex-col bg-background">
        <WorkspaceHeader badge={t("dev.badge")} right={<DevSearch />} />
        <div className="flex min-h-0 flex-1">
          <WorkspaceSidebar
            label={t("dev.badge")}
            storageKey="tng.devSidebarWidth"
            switchTo={isAdmin ? { label: t("admin.switch"), icon: ShieldCheck, to: "/admin" } : undefined}
            items={[
              { label: t("dev.nav.lab"), icon: FlaskConical, to: "/dev/lab" },
              { label: t("dev.nav.run"), icon: PlayCircle, to: "/dev/run" },
            ]}
          />
          <main className="min-w-0 flex-1">
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      {/* Bảng tài khoản (avatar) đổi ảnh đại diện qua pickMedia() */}
      <MediaPickerHost />
    </SidebarProvider>
  );
}
