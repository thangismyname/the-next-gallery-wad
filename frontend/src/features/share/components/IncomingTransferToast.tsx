// Toast "Bạn bè vừa gửi file" — nghe `xfer:incoming` toàn app (MainLayout).
// Chỉ ảnh thư viện → đã nằm trong thư viện; có file trên máy → mở trang nhận.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSignaling } from "@/hooks/useSignaling";
import { SIGNAL } from "@/services/signaling";
import { transfersQueryKey } from "@/services/transfers";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";

interface Incoming {
  transferId: string;
  sender: { name: string };
  fileCount: number;
  libraryCount: number;
}

const TOAST_TTL_MS = 20_000;

export const IncomingTransferToast: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signaling = useSignaling();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Incoming[]>([]);

  useEffect(
    () =>
      signaling.on(SIGNAL.XFER_INCOMING, (payload) => {
        const item = payload as unknown as Incoming;
        if (!item.transferId) return;
        setItems((prev) => (prev.some((x) => x.transferId === item.transferId) ? prev : [...prev, item]));
        void queryClient.invalidateQueries({ queryKey: transfersQueryKey });
        if (item.libraryCount > 0) void queryClient.invalidateQueries({ queryKey: galleryQueryPrefix });
      }),
    [signaling, queryClient],
  );

  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(() => setItems((prev) => prev.slice(1)), TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [items]);

  if (!items.length) return null;
  const dismiss = (id: string) => setItems((prev) => prev.filter((x) => x.transferId !== id));

  return (
    <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-2 sm:bottom-4">
      {items.map((item) => {
        const libraryOnly = item.libraryCount === item.fileCount;
        return (
          <Alert key={item.transferId} className="w-80 shadow-lg">
            <Inbox className="size-4" />
            <AlertTitle className="flex items-center justify-between gap-2">
              {t("transfer.incomingTitle", { name: item.sender?.name ?? "" })}
              <button
                type="button"
                onClick={() => dismiss(item.transferId)}
                aria-label={t("common.cancel")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                {libraryOnly
                  ? t("transfer.incomingLibrary", { count: item.fileCount })
                  : t("transfer.incomingFiles", { count: item.fileCount })}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  dismiss(item.transferId);
                  navigate(libraryOnly ? "/gallery" : `/r/${item.transferId}`);
                }}
              >
                {libraryOnly ? t("transfer.openGallery") : t("transfer.receive")}
              </Button>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
};
