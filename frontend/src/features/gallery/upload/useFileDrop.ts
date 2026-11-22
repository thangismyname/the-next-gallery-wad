import { useEffect, useRef, useState } from "react";

import { filesFromDrop, isFileDrag } from "./mediaFiles";

/**
 * Kéo file / thư mục từ máy vào bất kỳ đâu trên trang (lắng nghe `window` khi trang đang mở).
 * Trả về `true` khi đang kéo file qua trang (để vẽ lớp phủ "Thả để tải lên").
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  useEffect(() => {
    if (!enabled) return;
    // dragenter / dragleave bắn cho từng phần tử con → đếm độ sâu thay vì bật / tắt ngay.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault(); // bắt buộc để `drop` được bắn
    };
    const leave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!isFileDrag(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      // filesFromDrop đọc `items` đồng bộ trước lần await đầu (sau sự kiện thì DataTransfer bị xoá).
      void filesFromDrop(e.dataTransfer).then((files) => onFilesRef.current(files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      setDragging(false);
    };
  }, [enabled]);

  return dragging;
}
