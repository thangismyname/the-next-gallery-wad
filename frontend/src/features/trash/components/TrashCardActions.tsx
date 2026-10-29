import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2 } from "lucide-react";

type Props = {
  onRestore: () => void;
  onDeleteForever: () => void;
};

/** Nút Khôi phục / Xóa vĩnh viễn hiện khi hover card ảnh trong thùng rác. */
export const TrashCardActions: React.FC<Props> = ({
  onRestore,
  onDeleteForever,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        onClick={onRestore}
        title={t("trash.restore")}
        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-1.5 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-95"
      >
        <RotateCcw className="size-3" />
        {t("trash.restore")}
      </button>
      <button
        type="button"
        onClick={onDeleteForever}
        title={t("trash.deleteForever")}
        aria-label={t("trash.deleteForever")}
        className="flex items-center justify-center rounded-md bg-red-600/90 p-1.5 text-white transition hover:bg-red-600 active:scale-95"
      >
        <Trash2 className="size-3" />
      </button>
    </>
  );
};
