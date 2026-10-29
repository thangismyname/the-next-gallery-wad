import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useShareContext } from "./ShareProvider";
import { TransferSource } from "@/hooks/useFileTransfer";
import { fetchMediaByIds } from "@/services/media";
import { useGalleryActionsStore } from "@/hooks/useGalleryActionsStore";
import { QRTab } from "./components/QRTab";
import { FriendsTab } from "./components/FriendsTab";
import { LanTab } from "./components/LanTab";
import { buildMediaSource } from "./mediaSource";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaIds: string[];
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onOpenChange,
  mediaIds,
}) => {
  const { t } = useTranslation();
  const share = useShareContext();
  const shareInitialFriendId = useGalleryActionsStore(
    (s) => s.shareInitialFriendId,
  );

  const prevOpen = useRef(false);
  const sources = useRef<TransferSource[]>([]);
  const sending = useRef(false);
  const [tab, setTab] = useState<string>(
    shareInitialFriendId ? "friends" : "qr",
  );

  useEffect(() => {
    if (open && !prevOpen.current) {
      share.leaveRoom();
      share.createSession(mediaIds);
      if (mediaIds.length > 0) {
        // Lấy đúng các media đã chọn theo id (kể cả ảnh cũ ngoài trang đầu).
        fetchMediaByIds(mediaIds)
          .then((items) => {
            sources.current = items.map(buildMediaSource);
          })
          .catch(() => {
            sources.current = [];
          });
      }
    }
    prevOpen.current = open;
  }, [open, mediaIds, share]);

  // Khi mở từ luồng "gửi cho bạn bè" → mặc định tab friends
  useEffect(() => {
    if (open) setTab(shareInitialFriendId ? "friends" : "qr");
  }, [open, shareInitialFriendId]);

  const closeDialog = (next: boolean) => {
    if (!next) {
      if (shareInitialFriendId) {
        share.leaveRoom();
      }
      sources.current = [];
    }
    onOpenChange(next);
  };

  const connectedCount = useMemo(
    () =>
      Object.values(share.connStates).filter((state) => state === "connected")
        .length,
    [share.connStates],
  );

  const sendToConnected = async () => {
    if (
      sending.current ||
      sources.current.length === 0 ||
      connectedCount === 0
    )
      return;
    sending.current = true;
    const targets = Object.entries(share.connStates)
      .filter(([, state]) => state === "connected")
      .map(([peerId]) => peerId);
    try {
      await Promise.all(
        targets.map((peerId) =>
          share.sendToPeer(peerId, sources.current).catch(() => undefined),
        ),
      );
    } finally {
      sending.current = false;
    }
  };

  const sessionReady = share.session || shareInitialFriendId;

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
          <DialogDescription>
            {shareInitialFriendId
              ? t("share.friendSendTitle")
              : t("share.filesCount", {
                  done: String(mediaIds.length),
                  total: String(mediaIds.length),
                })}
          </DialogDescription>
        </DialogHeader>

        {!sessionReady ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("share.creating")}
          </div>
        ) : (
          <>
            <Separator />
            <Tabs
              value={tab}
              onValueChange={setTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="qr">{t("share.qrTab")}</TabsTrigger>
                <TabsTrigger value="friends">{t("share.friendsTab")}</TabsTrigger>
                <TabsTrigger value="lan">{t("share.lanTab")}</TabsTrigger>
              </TabsList>
              <TabsContent value="qr">
                {share.session ? (
                  <QRTab session={share.session} />
                ) : (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t("share.creating")}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="friends">
                <FriendsTab
                  mediaIds={mediaIds}
                  initialFriendId={shareInitialFriendId}
                />
              </TabsContent>
              <TabsContent value="lan">
                <LanTab
                  peers={share.peers}
                  connStates={share.connStates}
                  onConnect={(peerId) => {
                    void share.connectToPeer(peerId).catch(() => undefined);
                  }}
                />
              </TabsContent>
            </Tabs>

            {!shareInitialFriendId && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("share.filesCount", {
                    done: String(mediaIds.length),
                    total: String(mediaIds.length),
                  })}
                </p>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={
                    connectedCount === 0 ||
                    sources.current.length === 0 ||
                    sending.current
                  }
                  onClick={sendToConnected}
                >
                  <Send className="size-3.5" />
                  {t("share.sendToFriends", { count: connectedCount })}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
