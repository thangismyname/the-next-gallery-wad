// components/layout/MainLayout.tsx
import React, { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PageTransition } from "@/components/motion/PageTransition";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { cn } from "@/lib/utils";

import { Header } from "@/features/navigation/Header";
import { Sidebar } from "@/features/navigation/Sidebar";
import { BottomBar } from "@/features/navigation/BottomBar";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ShareDialog } from "@/features/share/ShareDialog";
import { IncomingTransferToast } from "@/features/share/components/IncomingTransferToast";
import { hostRegistry } from "@/features/share/engine/hostRegistry";
import { ensureDeviceKeyRegistered } from "@/features/share/engine/deviceKeys";
import { usePresenceListener } from "@/hooks/usePresence";
import { useSession } from "@/services/authClient";
import { DeleteConfirmDialog } from "@/features/gallery/components/DeleteConfirmDialog";
import { MomentInviteToast } from "@/features/moments/components/MomentInviteToast";
import { AlbumInviteToast } from "@/features/albums/components/AlbumInviteToast";
import { AddToAlbumDialog } from "@/features/albums/components/AddToAlbumDialog";
import { LabelManagerDialog } from "@/features/favorites/components/LabelManagerDialog";
import { MediaPickerHost } from "@/features/media-picker/MediaPickerHost";
import { FriendEventsToast } from "@/features/friends/components/FriendEventsToast";

// Toàn app: bạn bè online, khoá thiết bị (nhận file bạn bè gửi khi mình offline),
// toast có file đến. Đăng xuất (MainLayout unmount) → dừng mọi phiên đang phát.
const ShareRuntime: React.FC = () => {
  usePresenceListener();
  const { data: session } = useSession();
  useEffect(() => {
    if (session) void ensureDeviceKeyRegistered().catch(() => {});
  }, [session]);
  useEffect(() => () => hostRegistry.clear(), []);
  return <IncomingTransferToast />;
};

const LayoutContent: React.FC = () => {
  const { pathname } = useLocation();
  // Route "immersive" (Moments): trang tự quản lý vùng cuộn (snap pager) và
  // cần tràn viền → <main> bỏ padding + scroll, để chỉ có ĐÚNG 1 scroll container.
  const immersive = pathname.startsWith("/moments");
  const {
    confirmDelete,
    closeDeleteDialog,
    deleteDialogOpen,
    deleteBusy,
    pendingDeleteIds,
    shareDialogOpen,
    setShareDialogOpen,
    shareMediaIds,
  } = useGalleryActions();

  return (
    <>
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans w-full">
        <Header />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <BottomBar />
          <main
            className={cn(
              "min-h-0 flex-1",
              immersive
                ? // h-16 = Header → phần còn lại đúng bằng viewport
                  "relative h-[calc(100svh-4rem)] overflow-hidden p-0"
                : "p-6 pb-24 overflow-y-auto",
            )}
          >
            <PageTransition>
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            </PageTransition>
          </main>
        </div>
      </div>
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        mediaIds={shareMediaIds}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        count={pendingDeleteIds.length}
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={closeDeleteDialog}
      />
    </>
  );
};

export const MainLayout: React.FC = () => {
  return (
    <SidebarProvider defaultOpen={true}>
      <LayoutContent />
      <ShareRuntime />
      <MomentInviteToast />
      <AlbumInviteToast />
      <AddToAlbumDialog />
      <LabelManagerDialog />
      <MediaPickerHost />
      <FriendEventsToast />
    </SidebarProvider>
  );
};