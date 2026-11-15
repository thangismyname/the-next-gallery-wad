import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaListItem } from "@tng/shared";
import { MediaPickerDialog } from "@/features/media-picker/MediaPickerDialog";
import { AvatarCropDialog } from "./AvatarCropDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** New avatar = relative `/api/profile/avatar/<id>?c=…` (photo + crop, `avatarImagePath`). */
  onPick: (imageUrl: string) => void;
};

/**
 * Pick 1 photo from the library → crop it to the circle (`AvatarCropDialog`).
 * The stored URL is stable (not a signed URL that expires); the backend serves it
 * only while that photo is its owner's current avatar, cropped server-side.
 */
export const AvatarPickerDialog: React.FC<Props> = ({ open, onOpenChange, onPick }) => {
  const { t } = useTranslation();
  const [cropping, setCropping] = useState<MediaListItem | null>(null);
  return (
    <>
      <MediaPickerDialog
        open={open}
        onOpenChange={onOpenChange}
        max={1}
        initialFilter="photos"
        title={t("profile.avatarPickTitle")}
        description={t("profile.avatarPickDesc")}
        confirmLabel={() => t("profile.avatarNext")}
        onConfirm={([picked]) => picked && setCropping(picked)}
      />
      <AvatarCropDialog
        media={cropping}
        onClose={() => setCropping(null)}
        onDone={(path) => {
          setCropping(null);
          onPick(path);
        }}
      />
    </>
  );
};
