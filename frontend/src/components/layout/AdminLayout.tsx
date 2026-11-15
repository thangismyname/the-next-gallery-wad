import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { AdminHeader } from "@/features/admin/components/AdminHeader";
import { AdminSidebar } from "@/features/admin/components/AdminSidebar";

export function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const openSidebar = () => setIsSidebarOpen(true);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdminHeader onMenuClick={openSidebar} />
      <div className="flex flex-1">
        <AdminSidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
