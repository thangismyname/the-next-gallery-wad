import { useTranslation } from "react-i18next";
import { MediaPickerDialog } from "@/features/media-picker/MediaPickerDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mediaIds: string[]) => Promise<void>;
};

/** Chọn ảnh trong thư viện của mình để thêm vào album. */
export const AddMediaDialog: React.FC<Props> = ({ open, onOpenChange, onConfirm }) => {
  const { t } = useTranslation();
  return (
    <MediaPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("albums.addPhotos")}
      description={t("albums.addPhotosDesc")}
      confirmLabel={(n) => t("albums.addCount", { n })}
      onConfirm={(items) => onConfirm(items.map((i) => i.id))}
    />
  );
};
