import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MediaPickerHost } from "@/features/media-picker/MediaPickerHost";
import { WorkspaceHeader } from "@/components/layout/workspace/WorkspaceHeader";
import { AdminSearch } from "@/features/admin/shared/AdminSearch";
import { AdminSidebar } from "@/features/admin/shared/AdminSidebar";

export function AdminLayout() {
  const { t } = useTranslation();
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full flex-col bg-background">
        <WorkspaceHeader badge={t("admin.badge")} right={<AdminSearch />} />
        <div className="flex min-h-0 flex-1">
          <AdminSidebar />
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
