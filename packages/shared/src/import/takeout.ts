// Google Takeout (Google Photos) import planner — pure, shared by web + mobile.
// Input = every file path under the picked folder; output = what to upload, with which JSON sidecar
// and which albums. Reading files / uploading is the caller's job.
import type { UploadMeta } from "../types/media";

const MEDIA_EXTS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "avif", "tif", "tiff", "bmp", "heic", "heif",
  "mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp", "mts", "m2ts",
]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp", "mts", "m2ts"]);
/** "-edited" in the languages Takeout writes it — the edited copy shares the original's JSON. */
const EDITED = /-(edited|bearbeitet|modifié|editado|modificato|bewerkt|redigerad|muokattu|編集済み)$/i;
const DUP = /\((\d+)\)$/;
/** Takeout cuts JSON names to ~46 chars; a key this long that is a prefix counts as a match. */
const TRUNCATED_MIN = 40;

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};
export const isTakeoutMedia = (name: string) => MEDIA_EXTS.has(extOf(name));
export const isTakeoutVideo = (name: string) => VIDEO_EXTS.has(extOf(name));

/** "IMG(1)" → ["IMG", "1"]; "IMG" → ["IMG", ""]. */
function splitDup(stem: string): [string, string] {
  const m = stem.match(DUP);
  return m ? [stem.slice(0, m.index), m[1]] : [stem, ""];
}

/**
 * Pick the JSON sidecar of `mediaName` among the `.json` names of its folder, or null.
 * Handles `x.jpg.json`, `x.jpg.supplemental-metadata.json` (+ truncated forms), the `(1)` counter
 * Takeout moves after the extension (`x(1).jpg` ↔ `x.jpg(1).json`), `-edited` copies, and a
 * Live Photo / Motion Photo video using its photo's JSON (`x.MP4` ↔ `x.HEIC.json`).
 */
export function matchSidecar(mediaName: string, jsonNames: string[]): string | null {
  const dot = mediaName.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = mediaName.slice(dot);
  const [base, idx] = splitDup(mediaName.slice(0, dot));
  const bases = [...new Set([base, base.replace(EDITED, "")])];

  let best: string | null = null;
  let bestScore = 0;
  for (const json of jsonNames) {
    if (!json.toLowerCase().endsWith(".json")) continue;
    const [key, keyIdx] = splitDup(json.slice(0, -5));
    if (keyIdx !== idx) continue;
    let score = 0;
    for (const [i, b] of bases.entries()) {
      // Matches on the real name beat matches on the "-edited"-stripped one.
      const bonus = i === 0 ? 0.5 : 0;
      const full = b + ext;
      const candidates = [`${full}.supplemental-metadata`, full];
      if (candidates.includes(key)) score = Math.max(score, 300 + bonus);
      else if (key.length >= TRUNCATED_MIN && candidates.some((c) => c.startsWith(key)))
        score = Math.max(score, 200 + key.length / 1000 + bonus);
      else if (new RegExp(`^${escapeRe(b)}\\.[^.]+(\\.supplemental-metadata)?$`).test(key))
        score = Math.max(score, 100 + bonus);
    }
    if (score > bestScore) {
      bestScore = score;
      best = json;
    }
  }
  return best;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Geo = { latitude?: unknown; longitude?: unknown };
/** Takeout writes 0,0 when there is no location. */
function geoOf(geo: Geo | undefined): { lat: number; lng: number } | null {
  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Sidecar JSON → upload meta: `photoTakenTime` (seconds since epoch), `favorited`, `description`,
 * `geoData` (else `geoDataExif`).
 */
export function sidecarMeta(json: unknown): UploadMeta {
  const meta: UploadMeta = {};
  if (!json || typeof json !== "object") return meta;
  const j = json as {
    photoTakenTime?: { timestamp?: string | number };
    favorited?: unknown;
    description?: unknown;
    geoData?: Geo;
    geoDataExif?: Geo;
  };
  const seconds = Number(j.photoTakenTime?.timestamp);
  if (Number.isFinite(seconds) && seconds > 0) meta.takenAt = new Date(seconds * 1000).toISOString();
  if (j.favorited === true) meta.favorite = true;
  if (typeof j.description === "string" && j.description.trim()) meta.description = j.description.trim().slice(0, 2000);
  const location = geoOf(j.geoData) ?? geoOf(j.geoDataExif);
  if (location) meta.location = location;
  return meta;
}

export interface TakeoutEntry {
  /** Path relative to the picked folder, "/"-separated. */
  path: string;
  size?: number | null;
}

export interface TakeoutPlanItem {
  path: string;
  size: number | null;
  /** Live Photo video uploaded together with this photo (not as its own item). */
  motionPath: string | null;
  /** "-edited" copy made in Google Photos. */
  edited: boolean;
  /** Original that also has an "-edited" copy next to it. */
  hasEdited: boolean;
  jsonPath: string | null;
  /** Album folders (paths) this photo appears in. */
  albumFolders: string[];
}

export interface TakeoutPlan {
  items: TakeoutPlanItem[];
  /** Album folders + their `metadata.json` (title) if present. */
  albums: { folder: string; name: string; metadataPath: string | null }[];
  stats: {
    media: number;
    videos: number;
    duplicates: number;
    missingJson: number;
    skipped: number;
    /** Photos with a Live Photo video attached. */
    livePhotos: number;
    /** "-edited" copies. */
    edited: number;
  };
}

/** Which of an original + its "-edited" copy to import. */
export type EditedMode = "both" | "original" | "edited";

/** Items to upload for `mode` (an original without an edited copy is always kept). */
export function itemsForMode(items: TakeoutPlanItem[], mode: EditedMode): TakeoutPlanItem[] {
  if (mode === "original") return items.filter((it) => !it.edited);
  if (mode === "edited") return items.filter((it) => !it.hasEdited);
  return items;
}

const LIVE_PHOTO_EXTS = new Set(["heic", "heif", "jpg", "jpeg"]);
const LIVE_VIDEO_EXTS = new Set(["mov", "mp4"]);
const splitExt = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1).toLowerCase()] : [name, ""];
};

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * Plan an import from every file under a Takeout folder (zip already extracted).
 * - Album folder = a folder holding `metadata.json`; others ("Photos from 2019"…) are plain.
 * - The same photo (same name + size) in a year folder and album folders is uploaded once,
 *   with all those albums.
 * - Live Photo = HEIC/JPG + MOV/MP4 with the same base name in the same folder → one item.
 * - "-edited" copies are marked (`edited`, `hasEdited` on the original) for `itemsForMode`.
 */
export function planTakeout(entries: TakeoutEntry[]): TakeoutPlan {
  const jsonByDir = new Map<string, string[]>();
  const albumMeta = new Map<string, string>();
  for (const e of entries) {
    const name = nameOf(e.path);
    if (!name.toLowerCase().endsWith(".json")) continue;
    const dir = dirOf(e.path);
    if (name === "metadata.json") albumMeta.set(dir, e.path);
    else jsonByDir.set(dir, [...(jsonByDir.get(dir) ?? []), name]);
  }

  // Per folder: photo base names (Live Photo pairs) + bases that have an "-edited" copy.
  const photoBase = new Map<string, string>(); // "dir\0base" (lowercase) → photo path
  const editedBase = new Set<string>(); // "dir\0base" of originals with an edited copy
  for (const e of entries) {
    const [base, ext] = splitExt(nameOf(e.path));
    const dir = dirOf(e.path);
    if (LIVE_PHOTO_EXTS.has(ext)) photoBase.set(`${dir}\u0000${base.toLowerCase()}`, e.path);
    if (EDITED.test(base) && isTakeoutMedia(nameOf(e.path))) editedBase.add(`${dir}\u0000${base.replace(EDITED, "").toLowerCase()}`);
  }
  const motionOf = new Map<string, string>(); // photo path → video path
  for (const e of entries) {
    const [base, ext] = splitExt(nameOf(e.path));
    const photo = LIVE_VIDEO_EXTS.has(ext) ? photoBase.get(`${dirOf(e.path)}\u0000${base.toLowerCase()}`) : undefined;
    if (photo) motionOf.set(photo, e.path);
  }
  const motionVideos = new Set(motionOf.values());

  const byKey = new Map<string, TakeoutPlanItem>();
  let skipped = 0;
  let duplicates = 0;
  for (const e of entries) {
    const name = nameOf(e.path);
    if (name.toLowerCase().endsWith(".json") || motionVideos.has(e.path)) continue;
    if (!isTakeoutMedia(name)) {
      skipped += 1;
      continue;
    }
    const dir = dirOf(e.path);
    const [base] = splitExt(name);
    const json = matchSidecar(name, jsonByDir.get(dir) ?? []);
    const jsonPath = json ? (dir ? `${dir}/${json}` : json) : null;
    const isAlbum = albumMeta.has(dir);
    const key = `${name}\u0000${e.size ?? ""}`;
    const seen = byKey.get(key);
    if (seen) {
      duplicates += 1;
      if (isAlbum && !seen.albumFolders.includes(dir)) seen.albumFolders.push(dir);
      seen.jsonPath ??= jsonPath;
      seen.motionPath ??= motionOf.get(e.path) ?? null;
      continue;
    }
    byKey.set(key, {
      path: e.path,
      size: e.size ?? null,
      jsonPath,
      albumFolders: isAlbum ? [dir] : [],
      motionPath: motionOf.get(e.path) ?? null,
      edited: EDITED.test(base),
      hasEdited: editedBase.has(`${dir}\u0000${base.toLowerCase()}`),
    });
  }

  const items = [...byKey.values()];
  const used = new Set(items.flatMap((i) => i.albumFolders));
  return {
    items,
    albums: [...used].map((folder) => ({ folder, name: nameOf(folder) || folder, metadataPath: albumMeta.get(folder) ?? null })),
    stats: {
      media: items.length,
      videos: items.filter((i) => isTakeoutVideo(i.path)).length,
      duplicates,
      missingJson: items.filter((i) => !i.jsonPath).length,
      skipped,
      livePhotos: items.filter((i) => i.motionPath).length,
      edited: items.filter((i) => i.edited).length,
    },
  };
}

/** Album title from an album folder's `metadata.json` (falls back to the folder name). */
export function albumTitle(json: unknown, fallback: string): string {
  const title = (json as { title?: unknown } | null)?.title;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : fallback;
}
