import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FolderHeart, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSignaling } from "@/hooks/useSignaling";
import { SIGNAL } from "@/services/signaling";
import { albumsQueryKey } from "@/services/albums";

interface AlbumInvite {
  albumId?: string;
  albumName?: string;
  inviterName?: string;
}

const TOAST_TTL_MS = 15_000;

/**
 * Toast lời mời vào album chung — mount toàn app (MainLayout), nghe
 * `album:invite` trên socket. Nhận / từ chối ở trang Albums.
 */
export const AlbumInviteToast: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signaling = useSignaling();
  const queryClient = useQueryClient();
  const [invites, setInvites] = useState<AlbumInvite[]>([]);

  useEffect(
    () =>
      signaling.on(SIGNAL.ALBUM_INVITE, (payload) => {
        const invite = payload as AlbumInvite;
        if (!invite.albumId) return;
        setInvites((prev) =>
          prev.some((x) => x.albumId === invite.albumId)
            ? prev
            : [...prev, invite],
        );
        void queryClient.invalidateQueries({ queryKey: albumsQueryKey });
      }),
    [signaling, queryClient],
  );

  useEffect(() => {
    if (invites.length === 0) return;
    const timer = setTimeout(
      () => setInvites((prev) => prev.slice(1)),
      TOAST_TTL_MS,
    );
    return () => clearTimeout(timer);
  }, [invites]);

  const dismiss = (albumId?: string) =>
    setInvites((prev) => prev.filter((x) => x.albumId !== albumId));

  if (invites.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-2 sm:bottom-4">
      {invites.map((invite) => (
        <Alert key={invite.albumId} className="w-80 shadow-lg">
          <FolderHeart className="size-4" />
          <AlertTitle className="flex items-center justify-between gap-2">
            {t("albums.inviteToastTitle")}
            <button
              type="button"
              onClick={() => dismiss(invite.albumId)}
              aria-label={t("moments.close")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {t("albums.inviteToastBody", {
                name: invite.inviterName ?? "",
                album: invite.albumName ?? "",
              })}
            </p>
            <Button
              size="sm"
              onClick={() => {
                dismiss(invite.albumId);
                navigate("/albums");
              }}
            >
              {t("albums.viewInvitation")}
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
