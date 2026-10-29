// Đọc các nguồn mà sharp không tự decode được:
//   - HEIC/HEIF (ảnh iPhone) → giải mã bằng heic-decode (libheif WASM) ra RGBA thô.
//   - Video → cắt 1 khung hình làm poster bằng ffmpeg (ffmpeg-static, hoặc
//     FFMPEG_PATH nếu muốn dùng bản cài trên máy) + đọc thời lượng/kích thước.
//   - Ngày chụp: EXIF (ảnh, kể cả HEIC) / creation_time (video).
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import decodeHeic from "heic-decode";
import exifr from "exifr";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic;
const FFMPEG_TIMEOUT_MS = 60_000;

const HEIF_EXTS = new Set([".heic", ".heif"]);
const HEIF_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
// Ảnh raster được nhận. KHÔNG nhận image/svg+xml: SVG chứa được script, mà
// /file trả lại đúng Content-Type từ origin của API.
const PHOTO_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
  "image/bmp",
]);
const VIDEO_EXTS = new Set([
  ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".3gp", ".mts", ".m2ts",
]);

/**
 * Phân loại file upload theo MIME, fallback theo đuôi file — Windows/Android
 * thường gửi HEIC/MOV với MIME rỗng hoặc application/octet-stream.
 * → { mediaType: "photo"|"video"|null, mimeType } (null = không nhận).
 */
export function classifyUpload(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  if (HEIF_MIMES.has(mime) || HEIF_EXTS.has(ext)) {
    return { mediaType: "photo", mimeType: ext === ".heif" ? "image/heif" : "image/heic" };
  }
  if (mime.startsWith("video/")) return { mediaType: "video", mimeType: mime };
  if (PHOTO_MIMES.has(mime)) return { mediaType: "photo", mimeType: mime };
  if (VIDEO_EXTS.has(ext)) {
    return { mediaType: "video", mimeType: ext === ".mov" ? "video/quicktime" : `video/${ext.slice(1)}` };
  }
  return { mediaType: null, mimeType: mime };
}

/** Item DB (mime_type / file_ext) là HEIC/HEIF — trình duyệt (trừ Safari) không hiển thị được. */
export function isHeifItem(item) {
  return (
    HEIF_MIMES.has(String(item.mime_type || "").toLowerCase()) ||
    HEIF_EXTS.has(`.${String(item.file_ext || "").toLowerCase()}`)
  );
}

// File HEIF bắt đầu bằng box "ftyp" + brand họ HEIC (AVIF dùng brand khác,
// sharp tự đọc được).
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

async function sniffHeif(filePath) {
  const fh = await fs.open(filePath, "r");
  try {
    const { buffer } = await fh.read(Buffer.alloc(12), 0, 12, 0);
    if (buffer.toString("latin1", 4, 8) !== "ftyp") return false;
    return HEIF_BRANDS.has(buffer.toString("latin1", 8, 12));
  } finally {
    await fh.close();
  }
}

/**
 * Nguồn đưa vào sharp cho 1 file ảnh trên đĩa: HEIC → RGBA thô (đã xoay đúng
 * chiều bởi libheif), còn lại → đường dẫn file (sharp tự xoay theo EXIF).
 * → { input, options, autoRotate }
 */
export async function openImageSource(filePath) {
  if (await sniffHeif(filePath)) {
    const { width, height, data } = await decodeHeic({
      buffer: await fs.readFile(filePath),
    });
    return {
      input: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      options: { raw: { width, height, channels: 4 } },
      autoRotate: false,
    };
  }
  return { input: filePath, options: { failOn: "none" }, autoRotate: true };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    let err = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => {
      // Chỉ giữ phần đầu (thông tin input) — đủ để parse metadata.
      if (err.length < 20_000) err += c;
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
}

// Ngày chụp hợp lệ: sau 1990 và không ở tương lai (bỏ giá trị rác 1970/1904 của
// máy không đặt giờ).
function validTakenAt(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1990 || date.getTime() > Date.now() + 86_400_000) return null;
  return date;
}

/**
 * Ngày chụp của ảnh từ EXIF (DateTimeOriginal → CreateDate). `input` = đường
 * dẫn file hoặc Buffer (chỉ cần phần đầu file). Không có / lỗi → null.
 */
export async function readPhotoTakenAt(input) {
  try {
    const exif = await exifr.parse(input, { pick: ["DateTimeOriginal", "CreateDate"] });
    return validTakenAt(exif?.DateTimeOriginal ?? exif?.CreateDate);
  } catch {
    return null;
  }
}

function parseVideoInfo(stderr) {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSeconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
  const size = /Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  let width = size ? Number(size[1]) : null;
  let height = size ? Number(size[2]) : null;
  // Video quay dọc trên điện thoại: lưu ngang + metadata xoay 90°.
  const rot = /rotation of (-?\d+(?:\.\d+)?) degrees|rotate\s*:\s*(-?\d+)/.exec(stderr);
  const deg = rot ? Math.abs(Number(rot[1] ?? rot[2])) % 180 : 0;
  if (deg === 90) [width, height] = [height, width];
  // Ngày quay: metadata "creation_time : 2024-05-01T10:00:00.000000Z".
  const created = /creation_time\s*:\s*(\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?)/.exec(stderr);
  const takenAt = validTakenAt(created?.[1]);
  return { durationSeconds, width, height, takenAt };
}

/** Ngày quay của video (metadata creation_time) — chỉ đọc header, không giải mã. */
export async function readVideoTakenAt(input) {
  const { stderr } = await runFfmpeg(["-hide_banner", "-nostdin", "-i", input]);
  return parseVideoInfo(stderr).takenAt;
}

/**
 * Cắt 1 khung hình JPEG làm poster (giây thứ 1, video ngắn hơn → khung đầu).
 * `input` = đường dẫn file hoặc URL (presigned MinIO — ffmpeg chỉ đọc đoạn cần
 * nhờ HTTP Range, không tải cả video). ffmpeg tự xoay khung theo metadata.
 * → { poster, durationSeconds, width, height, takenAt }
 */
export async function extractVideoPoster(input) {
  let info = null;
  for (const seek of [1, 0]) {
    const { stdout, stderr } = await runFfmpeg([
      "-hide_banner", "-nostdin",
      "-ss", String(seek),
      "-i", input,
      "-frames:v", "1",
      "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "2",
      "pipe:1",
    ]);
    info = parseVideoInfo(stderr);
    if (stdout.length > 0) return { poster: stdout, ...info };
  }
  throw new Error("ffmpeg không cắt được khung hình nào từ video");
}
