// Import engine (Google Takeout) — the whole run outside React, shared by web + mobile.
// Platform code only supplies a source (how to list / read files) and how to upload one batch.
import { create } from "zustand";

import type { UploadMeta } from "../types/media";
import {
  MAX_IMPORT_FAILURES,
  type ImportFailure,
  type ImportFailureReason,
  type ImportSession,
  type ImportsService,
} from "../services/imports";
import {
  albumTitle,
  itemsForMode,
  planTakeout,
  sidecarMeta,
  type EditedMode,
  type TakeoutEntry,
  type TakeoutPlan,
  type TakeoutPlanItem,
} from "./takeout";
import { runUploadLoop, type UploadLoopProgress } from "./uploadLoop";

/** Where the files come from (folder, zip files, phone folder). P = what the uploader sends. */
export interface ImportSource<P> {
  /** Every file under the source; call `onCount` while walking. */
  list: (onCount: (files: number) => void) => Promise<TakeoutEntry[]>;
  readText: (path: string) => Promise<string>;
  /** One file ready to upload (may read it into memory — called right before sending). */
  prepare: (path: string) => Promise<P>;
  /** Free resources (zip readers…). */
  close?: () => void;
}

export interface ImportDeps<P> {
  client: "web" | "mobile";
  imports: Pick<ImportsService, "checkImport" | "createImport" | "updateImport">;
  /** Own manual albums (to reuse one with the same name). */
  listAlbums: () => Promise<{ id: string; name: string }[]>;
  createAlbum: (name: string) => Promise<string>;
  /** POST /gallery/media with these files + `meta` (same order) → one result per file. */
  upload: (parts: P[], meta: UploadMeta[], signal: AbortSignal) => Promise<{ duplicate?: boolean }[]>;
  /** New photos landed (refresh the gallery — debounced by the caller if needed). */
  onUploaded?: () => void;
}

export type ImportPhase =
  | { kind: "idle" }
  | { kind: "scanning"; files: number }
  | { kind: "checking" }
  | { kind: "ready"; plan: TakeoutPlan; existing: Set<string> }
  | { kind: "running"; step: "metadata" | "albums" | "upload"; done: number; total: number }
  | { kind: "finished"; status: "done" | "cancelled" | "failed" }
  | { kind: "error"; error: string };

export interface ImportState {
  phase: ImportPhase;
  progress: UploadLoopProgress | null;
  /** Failures of the last run (all of them locally; the server keeps the first 500). */
  failures: ImportFailure[];
  session: ImportSession | null;
  scan: (source: ImportSource<unknown>) => Promise<void>;
  /** `edited` = which of an original + its "-edited" copy to import (default both). */
  start: (options?: { edited?: EditedMode }) => Promise<void>;
  /** Upload the failed items again (same source, same session). */
  retryFailed: () => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const CHECK_CHUNK = 1000;
const READ_CONCURRENCY = 8;
const FLUSH_MS = 10_000;

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Error keys (i18n `importer.errors.*`). */
export type ImportErrorKey = "scanFailed" | "noMedia" | "checkFailed" | "startFailed";

export function createImportStore<P>(deps: ImportDeps<P>) {
  let source: ImportSource<P> | null = null;
  let controller: AbortController | null = null;
  // Per-run data kept outside the store (big maps, not rendered).
  let sidecars = new Map<string, unknown>();
  let albumIds = new Map<string, string>();
  let byPath = new Map<string, TakeoutPlanItem>();
  let existingCount = 0;

  return create<ImportState>((set, get) => {
    const fail = (error: ImportErrorKey) => set({ phase: { kind: "error", error } });

    const flush = async (status?: "done" | "cancelled" | "failed") => {
      const { session, failures } = get();
      if (!session) return;
      try {
        const next = await deps.imports.updateImport(session.id, {
          ...(status ? { status } : {}),
          skippedExisting: existingCount,
          failures: failures.slice(0, MAX_IMPORT_FAILURES),
        });
        set({ session: next });
      } catch {
        // Report is best effort — the photos are what matter.
      }
    };

    const metaFor = (item: TakeoutPlanItem, sessionId: string): UploadMeta => {
      const ids = item.albumFolders.map((f) => albumIds.get(f)).filter((id): id is string => Boolean(id));
      return {
        ...sidecarMeta(item.jsonPath ? sidecars.get(item.jsonPath) : null),
        ...(ids.length ? { albumIds: ids } : {}),
        bulk: true,
        importId: sessionId,
      };
    };

    /**
     * Upload `items`; failures are appended. Returns the final status. A Live Photo item = its photo
     * + its video in the same request, the video right after with `livePhotoOf` = the photo's index.
     */
    const upload = async (items: TakeoutPlanItem[], sessionId: string, signal: AbortSignal) => {
      const progress = await runUploadLoop<TakeoutPlanItem, P[]>({
        items,
        signal,
        prepare: async (item) =>
          item.motionPath ? [await source!.prepare(item.path), await source!.prepare(item.motionPath)] : [await source!.prepare(item.path)],
        send: async (groups, batch, sig) => {
          const parts: P[] = [];
          const meta: UploadMeta[] = [];
          const photoIndex: number[] = [];
          groups.forEach((group, i) => {
            photoIndex.push(parts.length);
            parts.push(group[0]);
            meta.push(metaFor(batch[i], sessionId));
            if (group[1] !== undefined) {
              parts.push(group[1]);
              meta.push({ livePhotoOf: photoIndex[i], bulk: true });
            }
          });
          const results = await deps.upload(parts, meta, sig);
          deps.onUploaded?.();
          // One result per item = its photo's.
          return photoIndex.map((i) => results[i] ?? {});
        },
        onProgress: (p) => set({ progress: p, phase: { kind: "running", step: "upload", done: p.done + p.failed, total: p.total } }),
        onFailure: (item, reason: ImportFailureReason) => set((s) => ({ failures: [...s.failures, { path: item.path, reason }] })),
      });
      return signal.aborted ? "cancelled" : progress.failed === progress.total && progress.total > 0 ? "failed" : "done";
    };

    return {
      phase: { kind: "idle" },
      progress: null,
      failures: [],
      session: null,

      scan: async (src) => {
        source?.close?.();
        source = src as ImportSource<P>;
        set({ phase: { kind: "scanning", files: 0 }, progress: null, failures: [], session: null });
        let entries: TakeoutEntry[];
        try {
          entries = await source.list((files) => set({ phase: { kind: "scanning", files } }));
        } catch {
          return fail("scanFailed");
        }
        const plan = planTakeout(entries);
        if (!plan.items.length) return fail("noMedia");
        set({ phase: { kind: "checking" } });
        try {
          // Already in the library (earlier import / upload) → skip before sending any bytes.
          const existing = new Set<string>();
          for (let i = 0; i < plan.items.length; i += CHECK_CHUNK) {
            const chunk = plan.items.slice(i, i + CHECK_CHUNK);
            const found = await deps.imports.checkImport(chunk.map((it) => ({ name: nameOf(it.path), size: it.size ?? 0 })));
            chunk.forEach((it, j) => found[j] && existing.add(it.path));
          }
          set({ phase: { kind: "ready", plan, existing } });
        } catch {
          fail("checkFailed");
        }
      },

      start: async (options) => {
        const { phase } = get();
        if (phase.kind !== "ready" || !source) return;
        const { plan, existing } = phase;
        const todo = itemsForMode(plan.items, options?.edited ?? "both").filter((it) => !existing.has(it.path));
        existingCount = existing.size;
        controller = new AbortController();
        const { signal } = controller;
        let session: ImportSession;
        try {
          session = await deps.imports.createImport({
            source: "takeout",
            client: deps.client,
            plan: { ...plan.stats, albums: plan.albums.length, existing: existing.size, toUpload: todo.length },
          });
        } catch {
          return fail("startFailed");
        }
        set({ session, failures: [] });
        const timer = setInterval(() => void flush(), FLUSH_MS);
        try {
          // 1. Sidecars → meta.
          sidecars = new Map();
          byPath = new Map(plan.items.map((it) => [it.path, it]));
          const jsonPaths = [...new Set(todo.map((it) => it.jsonPath).filter((p): p is string => Boolean(p)))];
          let next = 0;
          set({ phase: { kind: "running", step: "metadata", done: 0, total: jsonPaths.length } });
          await Promise.all(
            Array.from({ length: READ_CONCURRENCY }, async () => {
              while (next < jsonPaths.length && !signal.aborted) {
                const path = jsonPaths[next++];
                try {
                  sidecars.set(path, JSON.parse(await source!.readText(path)));
                } catch {
                  sidecars.set(path, null); // broken sidecar → upload anyway (EXIF still read server-side)
                }
                if (sidecars.size % 50 === 0 || sidecars.size === jsonPaths.length)
                  set({ phase: { kind: "running", step: "metadata", done: sidecars.size, total: jsonPaths.length } });
              }
            }),
          );

          // 2. Albums: reuse an own album with the same name (re-import), else create it.
          const needed = plan.albums.filter((a) => todo.some((it) => it.albumFolders.includes(a.folder)));
          set({ phase: { kind: "running", step: "albums", done: 0, total: needed.length } });
          albumIds = new Map();
          if (needed.length && !signal.aborted) {
            const owned = new Map((await deps.listAlbums()).map((a) => [a.name.toLowerCase(), a.id]));
            for (const [i, album] of needed.entries()) {
              if (signal.aborted) break;
              let meta: unknown = null;
              if (album.metadataPath) meta = await source.readText(album.metadataPath).then(JSON.parse, () => null);
              const name = albumTitle(meta, album.name);
              let id = owned.get(name.toLowerCase());
              if (!id) {
                id = await deps.createAlbum(name);
                owned.set(name.toLowerCase(), id);
              }
              albumIds.set(album.folder, id);
              set({ phase: { kind: "running", step: "albums", done: i + 1, total: needed.length } });
            }
          }

          // 3. Upload.
          const status = signal.aborted ? "cancelled" : await upload(todo, session.id, signal);
          clearInterval(timer);
          await flush(status);
          set({ phase: { kind: "finished", status } });
        } catch {
          clearInterval(timer);
          await flush("failed");
          set({ phase: { kind: "finished", status: "failed" } });
        }
      },

      retryFailed: async () => {
        const { session, failures } = get();
        if (!session || !source || !failures.length) return;
        const items = failures.map((f) => byPath.get(f.path)).filter((it): it is TakeoutPlanItem => Boolean(it));
        controller = new AbortController();
        // Reopen the session so the server counts these uploads too.
        set({ failures: [], progress: null });
        await deps.imports.updateImport(session.id, { status: "running" }).then((s) => set({ session: s }), () => {});
        const status = await upload(items, session.id, controller.signal);
        await flush(status);
        set({ phase: { kind: "finished", status } });
      },

      cancel: () => controller?.abort(),

      reset: () => {
        controller?.abort();
        source?.close?.();
        source = null;
        sidecars = new Map();
        albumIds = new Map();
        byPath = new Map();
        set({ phase: { kind: "idle" }, progress: null, failures: [], session: null });
      },
    };
  });
}
