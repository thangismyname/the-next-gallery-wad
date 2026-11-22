// Xuất cả thư viện của user thành 1 zip **định dạng Google Takeout** → mang sang Google Photos /
// Immich (immich-go) / nhập lại vào app (`/import`) đều đọc được:
//   Takeout/Google Photos/Photos from 2024/IMG_1.jpg + IMG_1.jpg.json (ngày chụp, tim, mô tả, vị trí)
//   Takeout/Google Photos/<Album>/metadata.json + bản sao ảnh của album (như Takeout thật)
//   Takeout/the-next-gallery.json — thứ Takeout không có: nhãn cá nhân, album thông minh.
// Stream thẳng từ MinIO (archiver `store`, tự zip64 khi > 4 GB) — không giữ file trong RAM.
import archiver from "archiver";
import { dbPool } from "../../config/db.js";
import { BUCKET_NAME, minioClient } from "../../config/minio.js";
import { logger } from "../../lib/logger.js";
import { attachmentHeader, safeFilename } from "./media.download.service.js";

const ROOT = "Takeout/Google Photos";

/** "IMG.jpg" đã có trong `used` (so không phân biệt hoa thường như macOS / Windows) → "IMG (2).jpg"… */
function uniqueIn(used, name) {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let picked = name;
  for (let i = 2; used.has(picked.toLowerCase()); i += 1) picked = `${base} (${i})${ext}`;
  used.add(picked.toLowerCase());
  return picked;
}

/** Sidecar JSON kiểu Takeout (các trường `@tng/shared` `sidecarMeta` đọc lại). */
export function takeoutSidecar(m) {
  const at = new Date(m.taken_at ?? m.created_at);
  const ts = (d) => ({ timestamp: String(Math.floor(d.getTime() / 1000)), formatted: d.toUTCString() });
  return {
    title: m.original_filename,
    description: m.caption ?? "",
    photoTakenTime: ts(at),
    creationTime: ts(new Date(m.created_at)),
    geoData: { latitude: m.latitude ?? 0, longitude: m.longitude ?? 0, altitude: 0 },
    favorited: Boolean(m.is_favorite),
  };
}

/**
 * Pure: danh sách entry của zip. `media` = hàng của user, `albums` = `{ name, description,
 * mediaIds }` (album thường), `labels` = `{ name, color, mediaIds }`, `smartAlbums` = `{ name, rule }`.
 * Mỗi entry: `{ name, object?, bucket?, json? }` (object = stream từ MinIO, json = nội dung).
 */
export function planExport({ media, albums = [], labels = [], smartAlbums = [] }) {
  const entries = [];
  const folders = new Map(); // folder → tên đã dùng (chữ thường)
  const take = (folder, name) => {
    if (!folders.has(folder)) folders.set(folder, new Set());
    return uniqueIn(folders.get(folder), name);
  };
  const byId = new Map(media.map((m) => [String(m.id), m]));
  const pathOf = new Map(); // media id → đường dẫn trong folder năm (cho manifest)

  const put = (folder, m) => {
    const fallback = `${m.id}${m.file_ext ? `.${m.file_ext}` : ""}`;
    const name = take(folder, safeFilename(m.original_filename, fallback));
    const bucket = m.minio_bucket || BUCKET_NAME;
    entries.push({ name: `${folder}/${name}`, object: m.minio_object, bucket });
    entries.push({ name: `${folder}/${name}.json`, json: takeoutSidecar(m) });
    if (m.motion_object) {
      // Live Photo: video cùng tên gốc, cùng thư mục → importer ghép lại thành 1 ảnh.
      const dot = name.lastIndexOf(".");
      const ext = m.motion_object.toLowerCase().endsWith(".mov") ? ".MOV" : ".MP4";
      const video = take(folder, `${dot > 0 ? name.slice(0, dot) : name}${ext}`);
      entries.push({ name: `${folder}/${video}`, object: m.motion_object, bucket });
    }
    return `${folder}/${name}`;
  };

  for (const m of media) {
    const year = new Date(m.taken_at ?? m.created_at).getUTCFullYear();
    pathOf.set(String(m.id), put(`${ROOT}/Photos from ${year}`, m));
  }

  const albumFolders = new Set(media.map((m) => `photos from ${new Date(m.taken_at ?? m.created_at).getUTCFullYear()}`));
  for (const album of albums) {
    const items = album.mediaIds.map((id) => byId.get(String(id))).filter(Boolean);
    if (!items.length) continue;
    const folderName = uniqueIn(albumFolders, safeFilename(album.name, "Album"));
    const folder = `${ROOT}/${folderName}`;
    entries.push({ name: `${folder}/metadata.json`, json: { title: album.name, description: album.description ?? "" } });
    for (const m of items) put(folder, m);
  }

  entries.push({
    name: "Takeout/the-next-gallery.json",
    json: {
      format: "the-next-gallery-export@1",
      exportedAt: new Date().toISOString(),
      note: "Google Photos layout. Labels / smart albums below are not part of Google Takeout.",
      labels: labels.map((l) => ({
        name: l.name,
        color: l.color,
        files: l.mediaIds.map((id) => pathOf.get(String(id))).filter(Boolean),
      })),
      smartAlbums,
    },
  });
  return entries;
}

async function loadExport(userId) {
  const [media, albums, labels, smart] = await Promise.all([
    dbPool.query(
      `SELECT id, original_filename, file_ext, minio_object, minio_bucket, motion_object, taken_at,
              created_at, caption, latitude, longitude, is_favorite
         FROM media
        WHERE user_id = $1 AND deleted_at IS NULL AND minio_object IS NOT NULL
        ORDER BY COALESCE(taken_at, created_at), id`,
      [userId],
    ),
    dbPool.query(
      `SELECT a.name, a.description,
              COALESCE(array_agg(am.media_id ORDER BY am.position NULLS FIRST, am.added_at)
                       FILTER (WHERE am.media_id IS NOT NULL), '{}') AS "mediaIds"
         FROM albums a LEFT JOIN album_media am ON am.album_id = a.id
        WHERE a.user_id = $1 AND a.kind = 'manual'
        GROUP BY a.id ORDER BY a.created_at`,
      [userId],
    ),
    dbPool.query(
      `SELECT COALESCE(l.name, l.preset) AS name, l.color,
              COALESCE(array_agg(ml.media_id) FILTER (WHERE ml.media_id IS NOT NULL), '{}') AS "mediaIds"
         FROM user_labels l LEFT JOIN media_user_labels ml ON ml.label_id = l.id
        WHERE l.user_id = $1
        GROUP BY l.id ORDER BY l.position`,
      [userId],
    ),
    dbPool.query(`SELECT name, smart_rule AS rule FROM albums WHERE user_id = $1 AND kind = 'smart'`, [userId]),
  ]);
  return { media: media.rows, albums: albums.rows, labels: labels.rows, smartAlbums: smart.rows };
}

/** `GET /api/gallery/media/export` — stream zip; client đóng tab → dừng. */
export async function streamLibraryExport(userId, res) {
  const entries = planExport(await loadExport(userId));
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", attachmentHeader(`the-next-gallery-export-${stamp}.zip`));

  const archive = archiver("zip", { store: true });
  let aborted = false;
  res.on("close", () => {
    if (!res.writableFinished) {
      aborted = true;
      archive.abort();
    }
  });
  archive.on("warning", (err) => logger.warn({ err }, "export zip"));
  archive.on("error", (err) => {
    logger.error({ err }, "export zip");
    res.destroy(err);
  });
  archive.pipe(res);

  for (const entry of entries) {
    if (aborted) return;
    if (entry.json) {
      archive.append(JSON.stringify(entry.json, null, 2), { name: entry.name });
      continue;
    }
    let stream;
    try {
      stream = await minioClient.getObject(entry.bucket, entry.object);
    } catch (err) {
      // 1 object mất trên MinIO không được làm hỏng cả bản xuất.
      logger.warn({ err, object: entry.object }, "export: missing object");
      continue;
    }
    await new Promise((resolve, reject) => {
      archive.once("entry", resolve);
      stream.once("error", reject);
      archive.append(stream, { name: entry.name });
    });
  }
  await archive.finalize();
}
