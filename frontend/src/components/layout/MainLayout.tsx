// components/layout/MainLayout.tsx
import React, { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { PageTransition } from "@/components/motion/PageTransition";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";

import { Header } from "@/features/navigation/Header";
import { Sidebar } from "@/features/navigation/Sidebar";
import { BottomBar } from "@/features/navigation/BottomBar";
import { useGalleryActions } from "@/hooks/useGalleryActions";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ShareProvider, useShareContext } from "@/features/share/ShareProvider";
import { ShareDialog } from "@/features/share/ShareDialog";
import { ShareNotification } from "@/features/share/components/ShareNotification";
import { ShareInvite } from "@/features/share/components/ShareInvite";
import { TransferProgress } from "@/features/share/components/TransferProgress";
import { DeleteConfirmDialog } from "@/features/gallery/components/DeleteConfirmDialog";
import { MomentInviteToast } from "@/features/moments/components/MomentInviteToast";
import { AlbumInviteToast } from "@/features/albums/components/AlbumInviteToast";
import { AddToAlbumDialog } from "@/features/albums/components/AddToAlbumDialog";
import { LabelManagerDialog } from "@/features/favorites/components/LabelManagerDialog";
import { saveDownload, saveGallery } from "@/features/share/receivedFile";
import { Button } from "@/components/ui/button";

const ShareOverlays: React.FC = () => {
  const { t } = useTranslation();
  const share = useShareContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!share.error) return;
    const timer = setTimeout(share.clearError, 4000);
    return () => clearTimeout(timer);
  }, [share.error, share.clearError]);

  const sender = share.pendingTransfer
    ? share.peers.find((p) => p.userId === share.pendingTransfer?.senderId)
    : undefined;

  return (
    <>
      {share.pendingTransfer && sender && (
        <ShareNotification
          senderName={sender.username}
          senderAvatar={sender.avatarUrl}
          files={share.pendingTransfer.files}
          onAccept={(mode) =>
            share.acceptTransfer(mode === "gallery" ? saveGallery : saveDownload)
          }
          onReject={share.rejectTransfer}
        />
      )}

      {share.invites.length > 0 && (
        <div className="fixed right-4 bottom-4 z-40 flex flex-col gap-2 items-end">
          {share.invites.map((invite) => (
            <ShareInvite
              key={invite.sessionId}
              invite={invite}
              onView={() => {
                share.dismissInvite(invite.sessionId);
                navigate(`/share/${invite.roomCode}`);
              }}
              onDismiss={() => share.dismissInvite(invite.sessionId)}
            />
          ))}
        </div>
      )}

      {share.progress && share.progress.status !== "completed" && (
        <div className="fixed right-4 bottom-20 z-50 w-[calc(100vw-2rem)] max-w-sm">
          <TransferProgress progress={share.progress} />
        </div>
      )}

      {share.error && (
        <div className="fixed right-4 bottom-20 z-[60] flex w-[calc(100vw-2rem)] max-w-sm items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 pr-2 text-sm text-destructive shadow-lg backdrop-blur">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1 truncate">
            {t("share.error", { message: share.error })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={share.clearError}
            aria-label={t("selection.cancel")}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
};

const LayoutContent: React.FC = () => {
  const {
    handleShare,
    handleDownload,
    handleDelete,
    handleFavorite,
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
        <div className="flex flex-1">
          <Sidebar />
          <BottomBar
            onShare={handleShare}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onFavorite={handleFavorite}
          />
          <main className="flex-1 p-6 pb-24 overflow-y-auto">
            <PageTransition>
              <Outlet />
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
      <ShareProvider>
        <LayoutContent />
        <ShareOverlays />
      </ShareProvider>
      <MomentInviteToast />
      <AlbumInviteToast />
      <AddToAlbumDialog />
      <LabelManagerDialog />
    </SidebarProvider>
  );
};