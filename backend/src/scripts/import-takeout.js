// Import a Google Takeout export straight into one user's library, on the server — for big
// libraries / demos where uploading through the browser would take too long.
//
//   npm run import:takeout -- <extracted Takeout folder> --user <userId> [--edited both|original|edited] [--dry-run]
//
// Same engine as the web / mobile importers (`@tng/shared` import/engine.ts, run via tsx): sidecar
// matching, albums, Live Photos, duplicate guard (SHA-256), import session + report in /api/imports.
// Calls the services in-process (no HTTP, no rate limit). Source files are only read, never moved.
// Zip files: extract first (`unzip`), several Takeout zips into the same folder.
import "../config/env.js";

import fs from "fs/promises";
import path from "path";

import { HttpError, createImportStore } from "@tng/shared";

import { dbPool } from "../config/db.js";
import { aiQueueStats } from "../modules/ai/ai.queue.js";
import { createAlbum } from "../modules/albums/albums.service.js";
import { createImport, findExistingUploads, updateImport } from "../modules/imports/imports.service.js";
import { parseUploadMeta } from "../modules/media/media.schema.js";
import { uploadMedia } from "../modules/media/media.upload.service.js";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", "3gp": "video/3gpp",
};

function parseArgs(argv) {
  const args = { folder: null, user: null, edited: "both", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user") args.user = argv[++i];
    else if (a === "--edited") args.edited = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (!args.folder) args.folder = a;
  }
  if (!args.folder || !args.user || !["both", "original", "edited"].includes(args.edited)) {
    console.error("Usage: npm run import:takeout -- <folder> --user <userId> [--edited both|original|edited] [--dry-run]");
    process.exit(2);
  }
  return args;
}

/** Every file under `root` → { path (relative, "/"), abs, size }. */
async function walk(root) {
  const out = [];
  for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const abs = path.join(entry.parentPath ?? entry.path, entry.name);
    const { size } = await fs.stat(abs);
    out.push({ path: path.relative(root, abs).split(path.sep).join("/"), abs, size });
  }
  return out;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.folder);
  const { rows } = await dbPool.query(`SELECT id, email FROM "user" WHERE id = $1`, [args.user]);
  if (!rows[0]) throw new Error(`User ${args.user} not found`);
  const userId = rows[0].id;
  console.log(`📂 ${root} → ${rows[0].email}`);

  const files = await walk(root);
  const byPath = new Map(files.map((f) => [f.path, f]));

  const store = createImportStore({
    client: "web", // the session list only knows web / mobile — the server CLI counts as web
    imports: {
      checkImport: (items) => findExistingUploads(userId, items),
      createImport: (body) => createImport(userId, body),
      updateImport: (id, patch) => updateImport(userId, id, patch),
    },
    listAlbums: async () =>
      (await dbPool.query(`SELECT id, name FROM albums WHERE user_id = $1 AND kind = 'manual'`, [userId])).rows,
    createAlbum: async (name) => (await createAlbum(userId, { name })).id,
    upload: async (parts, meta) => {
      try {
        // Same validation as the HTTP route.
        return await uploadMedia(userId, parts, parseUploadMeta(JSON.stringify(meta), parts.length));
      } catch (err) {
        // 4xx from the services → HttpError so the loop splits the batch / marks the bad file.
        if (err?.status >= 400 && err.status < 500) throw new HttpError(err.status, err.message);
        throw err;
      }
    },
  });

  await store.getState().scan({
    list: async (onCount) => {
      onCount(files.length);
      return files.map(({ path: p, size }) => ({ path: p, size }));
    },
    readText: (p) => fs.readFile(byPath.get(p).abs, "utf8"),
    // multer-like file object for uploadMedia (reads `path`, never deletes it here).
    prepare: async (p) => {
      const f = byPath.get(p);
      if (!f) throw new Error(`missing ${p}`);
      const name = path.basename(f.abs);
      const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
      return { path: f.abs, originalname: name, mimetype: MIME[ext] ?? "application/octet-stream", size: f.size };
    },
  });

  const phase = store.getState().phase;
  if (phase.kind !== "ready") throw new Error(`Scan failed: ${phase.kind === "error" ? phase.error : phase.kind}`);
  const { stats, albums } = phase.plan;
  console.log(
    `🔎 ${stats.media} media (${stats.videos} videos, ${stats.livePhotos} Live Photos, ${stats.edited} edited) · ` +
      `${albums.length} albums · ${stats.duplicates} duplicates in export · ${phase.existing.size} already in library · ` +
      `${stats.missingJson} without JSON`,
  );
  if (args.dryRun) return;

  let last = 0;
  const unsubscribe = store.subscribe((s) => {
    if (s.phase.kind !== "running" || Date.now() - last < 2000) return;
    last = Date.now();
    const p = s.progress;
    console.log(`… ${s.phase.step} ${s.phase.done}/${s.phase.total}${p ? ` (dup ${p.duplicates}, failed ${p.failed})` : ""}`);
  });
  process.on("SIGINT", () => store.getState().cancel());
  await store.getState().start({ edited: args.edited });
  unsubscribe();

  const { session, failures } = store.getState();
  console.log(`✅ ${store.getState().phase.kind === "finished" ? store.getState().phase.status : "?"}`, session?.counts ?? "");
  for (const f of failures.slice(0, 20)) console.log(`   ✗ ${f.reason} ${f.path}`);
  if (failures.length > 20) console.log(`   … ${failures.length - 20} more`);

  // AI (CLIP / YOLO / DINO) runs in this process's queue — wait so it isn't lost on exit.
  for (let s = aiQueueStats(); s.running || s.fast || s.bulk; s = aiQueueStats()) {
    console.log(`🧠 AI queue: ${s.running} running, ${s.fast + s.bulk} waiting`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());
