import { describe, expect, it } from "vitest";
import { createImportStore, type ImportSession, type UploadMeta } from "@tng/shared";

const session = (patch: Partial<ImportSession> = {}): ImportSession => ({
  id: "s1",
  source: "takeout",
  client: "web",
  status: "running",
  plan: {},
  counts: { imported: 0, duplicates: 0, skippedExisting: 0, failed: 0 },
  startedAt: "",
  finishedAt: null,
  ...patch,
});

const files: Record<string, string> = {
  "Takeout/Google Photos/Photos from 2019/IMG_1.jpg": "",
  "Takeout/Google Photos/Photos from 2019/IMG_1.jpg.json": JSON.stringify({ photoTakenTime: { timestamp: "1562000000" }, favorited: true }),
  "Takeout/Google Photos/Trip/IMG_1.jpg": "",
  "Takeout/Google Photos/Trip/metadata.json": JSON.stringify({ title: "Đà Lạt" }),
  "Takeout/Google Photos/Photos from 2019/OLD.jpg": "",
  "Takeout/Google Photos/Photos from 2019/IMG_2.jpg": "",
};

function setup() {
  const uploads: { parts: string[]; meta: UploadMeta[] }[] = [];
  const patches: unknown[] = [];
  const created: string[] = [];
  const store = createImportStore<string>({
    client: "web",
    imports: {
      checkImport: async (items) => items.map((it) => it.name === "OLD.jpg"),
      createImport: async () => session(),
      updateImport: async (_id, patch) => {
        patches.push(patch);
        return session({ status: patch.status ?? "running" });
      },
    },
    listAlbums: async () => [],
    createAlbum: async (name) => {
      created.push(name);
      return "album-1";
    },
    upload: async (parts, meta) => {
      uploads.push({ parts, meta });
      return parts.map(() => ({}));
    },
  });
  const source = {
    list: async () => Object.keys(files).map((path) => ({ path, size: 10 })),
    readText: async (path: string) => files[path],
    prepare: async (path: string) => path,
  };
  return { store, source, uploads, patches, created };
}

describe("import engine", () => {
  it("plans, skips what exists, creates albums and uploads with meta", async () => {
    const { store, source, uploads, patches, created } = setup();
    await store.getState().scan(source);
    const phase = store.getState().phase;
    expect(phase.kind).toBe("ready");
    if (phase.kind !== "ready") return;
    expect([...phase.existing]).toEqual(["Takeout/Google Photos/Photos from 2019/OLD.jpg"]);

    await store.getState().start();
    expect(store.getState().phase).toEqual({ kind: "finished", status: "done" });
    expect(created).toEqual(["Đà Lạt"]);
    const sent = uploads.flatMap((u) => u.parts.map((part, i) => ({ part, meta: u.meta[i] })));
    expect(sent.map((s) => s.part).sort()).toEqual([
      "Takeout/Google Photos/Photos from 2019/IMG_1.jpg",
      "Takeout/Google Photos/Photos from 2019/IMG_2.jpg",
    ]);
    const img1 = sent.find((s) => s.part.endsWith("IMG_1.jpg"))!.meta;
    expect(img1).toEqual({
      takenAt: "2019-07-01T16:53:20.000Z",
      favorite: true,
      albumIds: ["album-1"],
      bulk: true,
      importId: "s1",
    });
    expect(patches[patches.length - 1]).toEqual({ status: "done", skippedExisting: 1, failures: [] });
  });

  it("sends a Live Photo as photo + video in the same request", async () => {
    const uploads: { parts: string[]; meta: UploadMeta[] }[] = [];
    const store = createImportStore<string>({
      client: "web",
      imports: {
        checkImport: async (items) => items.map(() => false),
        createImport: async () => session(),
        updateImport: async () => session(),
      },
      listAlbums: async () => [],
      createAlbum: async () => "a",
      upload: async (parts, meta) => {
        uploads.push({ parts, meta });
        return parts.map(() => ({}));
      },
    });
    const paths = ["P/A.jpg", "P/LIVE.HEIC", "P/LIVE.MOV"];
    await store.getState().scan({
      list: async () => paths.map((path) => ({ path, size: 1 })),
      readText: async () => "{}",
      prepare: async (path: string) => path,
    });
    await store.getState().start();
    const { parts, meta } = uploads[0];
    const photo = parts.indexOf("P/LIVE.HEIC");
    expect(parts[photo + 1]).toBe("P/LIVE.MOV");
    expect(meta[photo + 1]).toEqual({ livePhotoOf: photo, bulk: true });
    expect(store.getState().progress).toMatchObject({ total: 2, done: 2 });
  });
});
