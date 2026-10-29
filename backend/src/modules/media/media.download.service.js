// Tải bản gốc: 1 file (`/file?download=1` → Content-Disposition) hoặc nhiều
// file nén zip, stream thẳng từ MinIO ra response (không giữ cả file trong RAM).
import archiver from "archiver";
import { dbPool } from "../../config/db.js";
import { BUCKET_NAME, minioClient } from "../../config/minio.js";

/** Tên file an toàn khi giải nén: bỏ thư mục / ký tự điều khiển / dấu chấm đầu. */
export function safeFilename(name, fallback = "file") {
  const cleaned = String(name || "")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

/** Header Content-Disposition: tên ASCII dự phòng + tên UTF-8 (RFC 5987). */
export function attachmentHeader(name) {
  const safe = safeFilename(name);
  const ascii = safe
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu: "Ảnh" → "Anh"
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

// Trùng tên trong zip → "IMG_1.jpg", "IMG_1 (2).jpg"…
function uniqueName(name, used) {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let i = 2;
  while (used.has(`${base} (${i})${ext}`)) i += 1;
  return `${base} (${i})${ext}`;
}

/**
 * Stream zip các media CỦA CHÍNH user (bỏ qua id lạ / đã xoá) theo thứ tự `ids`.
 * Không có file nào → 404 (trước khi gửi header). Ảnh / video đã nén sẵn →
 * `store` (không nén lại) cho nhanh.
 */
export async function streamMediaZip(userId, ids, res) {
  const result = await dbPool.query(
    `SELECT id, original_filename, file_ext, minio_object, minio_bucket
       FROM media
      WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])
        AND minio_object IS NOT NULL`,
    [userId, ids],
  );
  const byId = new Map(result.rows.map((row) => [String(row.id), row]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean);
  if (rows.length === 0) {
    throw Object.assign(new Error("Không có ảnh nào để tải"), { status: 404, code: "NOT_FOUND" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", attachmentHeader(`the-next-gallery-${stamp}-${rows.length}.zip`));

  const archive = archiver("zip", { store: true });
  let aborted = false;
  res.on("close", () => {
    if (!res.writableFinished) {
      aborted = true;
      archive.abort();
    }
  });
  archive.on("warning", (err) => console.warn("⚠️  zip:", err.message));
  archive.on("error", (err) => {
    console.error("❌ zip:", err.message);
    res.destroy(err);
  });
  archive.pipe(res);

  const used = new Set();
  for (const row of rows) {
    if (aborted) return;
    const fallback = `${row.id}${row.file_ext ? `.${row.file_ext}` : ""}`;
    const name = uniqueName(safeFilename(row.original_filename, fallback), used);
    used.add(name);
    // Lần lượt từng file — tránh mở hàng trăm kết nối MinIO cùng lúc.
    const stream = await minioClient.getObject(row.minio_bucket || BUCKET_NAME, row.minio_object);
    await new Promise((resolve, reject) => {
      archive.once("entry", resolve);
      stream.once("error", reject);
      archive.append(stream, { name });
    });
  }
  await archive.finalize();
}
