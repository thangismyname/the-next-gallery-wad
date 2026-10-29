import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Album } from "@/services/albums";
import { AlbumLinksPanel } from "./AlbumLinksPanel";
import { AlbumMembersPanel } from "./AlbumMembersPanel";

type Props = {
  album: Album;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Owner: tab Thành viên + Link công khai. Thành viên: chỉ xem danh sách. */
export const ShareAlbumDialog: React.FC<Props> = ({
  album,
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const isOwner = album.role === "owner";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isOwner ? t("albums.shareTitle") : t("albums.members")}
          </DialogTitle>
          <DialogDescription>
            {isOwner ? t("albums.shareDesc") : album.name}
          </DialogDescription>
        </DialogHeader>
        {isOwner ? (
          <Tabs defaultValue="members">
            <TabsList className="mb-3 w-full">
              <TabsTrigger value="members" className="flex-1">
                {t("albums.members")}
              </TabsTrigger>
              <TabsTrigger value="links" className="flex-1">
                {t("albums.links.title")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="members">
              <AlbumMembersPanel albumId={album.id} canManage />
            </TabsContent>
            <TabsContent value="links">
              <AlbumLinksPanel albumId={album.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <AlbumMembersPanel albumId={album.id} canManage={false} />
        )}
      </DialogContent>
    </Dialog>
  );
};
