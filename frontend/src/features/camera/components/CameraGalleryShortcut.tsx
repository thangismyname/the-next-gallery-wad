import { type GallerySort } from "@tng/shared";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Image } from "lucide-react";
import { fetchMedia } from "@/services/media";
import { galleryQueryPrefix } from "@/hooks/useGalleryMedia";

// Nút mở Thư viện cạnh nút chụp — hiển thị ảnh vừa mới chụp/lưu nhất.
// Query dùng chung prefix gallery nên khi camera save (invalidate galleryQueryPrefix)
// thumbnail trên nút tự cập nhật.
const SHORTCUT_SORT: GallerySort = "newest";

const CameraGalleryShortcut: React.FC<{ disabled?: boolean }> = ({
  disabled = false,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: [...galleryQueryPrefix, 1, SHORTCUT_SORT],
    queryFn: () => fetchMedia(0, 1, SHORTCUT_SORT),
    staleTime: 30_000,
  });

  const latest = data?.items?.[0];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => navigate("/gallery")}
      className="flex flex-col items-center gap-1 disabled:opacity-40"
      aria-label={t("sidebar.gallery")}
      title={t("sidebar.gallery")}
    >
      <span className="block size-12 overflow-hidden rounded-xl border-2 border-white/40 bg-white/10 shadow-lg">
        {latest?.thumbnailUrl ? (
          <img
            src={latest.thumbnailUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-white/60">
            <Image className="size-5" />
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium tracking-wide text-white/70">
        {t("sidebar.gallery")}
      </span>
    </button>
  );
};

export default CameraGalleryShortcut;