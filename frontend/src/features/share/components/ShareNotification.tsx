import React from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Download, Images } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileMetadata } from "@/types";
import { formatBytes } from "@/utils/format";

export type SaveMode = "gallery" | "download";

interface ShareNotificationProps {
  senderName: string;
  senderAvatar?: string | null;
  files: FileMetadata[];
  onAccept: (mode: SaveMode) => void;
  onReject: () => void;
}


export const ShareNotification: React.FC<ShareNotificationProps> = ({
  senderName,
  senderAvatar,
  files,
  onAccept,
  onReject,
}) => {
  const { t } = useTranslation();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Alert
      data-slot="share-notification"
      className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm gap-3 p-4 shadow-lg border-border/60"
    >
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          {senderAvatar ? <AvatarImage src={senderAvatar} alt={senderName} /> : null}
          <AvatarFallback>{senderName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <AlertTitle className="flex items-center gap-2">
            <BellRing className="size-4 shrink-0 text-primary" />
            {senderName}
          </AlertTitle>
          <AlertDescription className="mt-0.5">
            <span className="inline-flex items-center gap-1.5">
              <Images className="size-3.5" />
              {t("share.senderNotification", {
                name: senderName,
                count: files.length,
              })}
            </span>
            <span className="ml-1 text-xs">
              · {t("share.totalSize", { size: formatBytes(totalSize) })}
            </span>
          </AlertDescription>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="flex-1">
              <Download className="size-3.5" />
              {t("share.accept")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onAccept("gallery")}>
              {t("share.saveToGallery")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAccept("download")}>
              {t("share.download")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={onReject}>
          {t("share.reject")}
        </Button>
      </div>
    </Alert>
  );
};
