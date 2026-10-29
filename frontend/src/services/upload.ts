import { UploadProgress } from "@/types";
import { API_URL as BASE_URL } from "@/lib/config";

/**
 * Upload nhiều file, tự động chia thành các batch nhỏ (mặc định 10 file/lần)
 * để tránh lỗi LIMIT_UNEXPECTED_FILE của multer (giới hạn 20 file/request ở BE).
 * Gọi onProgress mỗi khi có tiến triển để FE vẽ progress bar.
 */
export async function uploadMediaInBatches(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
  batchSize = 10,
): Promise<any[]> {
  const uploaded: any[] = [];
  const totalCount = files.length;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const formData = new FormData();
    batch.forEach((file) => formData.append("media", file));

    const batchResult = await uploadOneBatchWithProgress(formData, (percent) => {
      onProgress?.({ uploadedCount: i, totalCount, currentBatchPercent: percent });
    });

    uploaded.push(...batchResult.uploaded);

    onProgress?.({
      uploadedCount: Math.min(i + batch.length, totalCount),
      totalCount,
      currentBatchPercent: 100,
    });
  }

  return uploaded;
}

// Dùng XMLHttpRequest thay vì fetch vì fetch không hỗ trợ theo dõi upload progress
function uploadOneBatchWithProgress(
  formData: FormData,
  onBatchProgress: (percent: number) => void,
): Promise<{ uploaded: any[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/gallery/media`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onBatchProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json.data ?? json);
        } catch {
          reject(new Error("Không thể đọc phản hồi từ server"));
        }
      } else {
        reject(new Error(`Upload thất bại (status ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối khi upload"));

    xhr.send(formData);
  });
}