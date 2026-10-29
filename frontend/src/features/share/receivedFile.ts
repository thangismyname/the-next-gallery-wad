// Lưu file vừa nhận qua P2P (WebRTC): tải về máy hoặc đưa vào thư viện.
import { uploadMedia } from "@/services/media";
import type { ReceivedFile } from "@/hooks/useShare";

/** Ghép các chunk thành file rồi cho trình duyệt tải về. */
export function saveDownload(received: ReceivedFile) {
  const blob = new Blob(received.chunks, { type: received.type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = received.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Upload vào thư viện; lỗi (mất mạng / quá dung lượng) → tải về máy thay thế. */
export async function saveGallery(received: ReceivedFile) {
  const blob = new Blob(received.chunks, { type: received.type });
  const file = new File([blob], received.name, { type: received.type });
  try {
    await uploadMedia([file]);
  } catch {
    saveDownload(received);
  }
}
