import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, FileArchive, FolderUp, ImageUp, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUploader } from "../upload/useUploader";

interface UploadButtonProps {
  onUploaded: () => void; // gọi lại để GalleryView refetch danh sách media
  /** false = không vẽ tiến độ / lỗi (đã có nút khác trên cùng trang vẽ). */
  showStatus?: boolean;
}

/**
 * Menu "Thêm ảnh": ảnh & video · cả thư mục (file không phải ảnh / video bị bỏ qua) · Google Takeout (→ `/import`).
 * Tiến độ dùng chung `useUploader` với kéo thả vào lưới.
 */
export const UploadButton: React.FC<UploadButtonProps> = ({ onUploaded, showStatus = true }) => {
  const { t } = useTranslation();
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { uploading, progress, error, errorCount, upload } = useUploader();

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // reset input để chọn lại cùng file (nếu cần) vẫn trigger onChange
    e.target.value = "";
    if (files.length) void upload(files, { onDone: onUploaded });
  };

  // % tổng thể = (số file đã xong toàn batch trước + % file đang chạy trong batch hiện tại) / tổng
  const overallPercent = progress
    ? Math.min(
        100,
        Math.round(((progress.uploadedCount + progress.currentBatchPercent / 100) / progress.totalCount) * 100),
      )
    : 0;

  return (
    // Tiến độ / lỗi nổi dưới nút (absolute) → thanh công cụ không cao lên khi upload.
    <div className="relative shrink-0">
      <input
        ref={filesRef}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={onPicked}
      />
      <input
        ref={folderRef}
        type="file"
        // webkitdirectory: chọn cả thư mục (mọi trình duyệt hiện đại); React chưa có kiểu cho thuộc tính này.
        {...{ webkitdirectory: "", directory: "" }}
        multiple
        className="hidden"
        onChange={onPicked}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={uploading} size="sm">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? t("gallery.upload.uploading") : t("gallery.upload.button")}
            {!uploading && <ChevronDown className="size-3.5 opacity-70" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => filesRef.current?.click()}>
            <ImageUp />
            {t("gallery.upload.files")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => folderRef.current?.click()}>
            <FolderUp />
            {t("gallery.upload.folder")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/import")}>
            <FileArchive />
            {t("gallery.upload.takeout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showStatus && uploading && progress && (
        <div className="glass absolute top-full right-0 z-20 mt-2 w-48 rounded-lg p-2">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {progress.uploadedCount}/{progress.totalCount}
            </span>
            <span>{overallPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-150 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      )}

      {showStatus && error && !uploading && (
        <span className="absolute top-full right-0 z-20 mt-2 w-max max-w-60 rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {t(error, { n: errorCount })}
        </span>
      )}
    </div>
  );
};
