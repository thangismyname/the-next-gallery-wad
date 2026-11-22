import { test } from "node:test";
import assert from "node:assert/strict";
import { planExport } from "./media.export.service.js";

const m = (id, name, extra = {}) => ({
  id,
  original_filename: name,
  file_ext: "jpg",
  minio_object: `u/${id}`,
  created_at: "2024-05-01T10:00:00Z",
  ...extra,
});

test("planExport: Takeout layout, unique names, albums, live photo, manifest", () => {
  const media = [
    m("1", "IMG.jpg", { is_favorite: true, taken_at: "2023-02-03T04:05:06Z", caption: "Biển", latitude: 10, longitude: 106 }),
    m("2", "img.JPG"),
    m("3", "live.HEIC", { motion_object: "u/3.mov" }),
  ];
  const names = planExport({
    media,
    albums: [{ name: "Đà Lạt", mediaIds: ["2", "x"] }, { name: "Empty", mediaIds: [] }],
    labels: [{ name: "In", color: "red", mediaIds: ["1"] }],
  });
  const paths = names.map((e) => e.name);
  assert.ok(paths.includes("Takeout/Google Photos/Photos from 2023/IMG.jpg"));
  assert.ok(paths.includes("Takeout/Google Photos/Photos from 2024/img.JPG"));
  assert.ok(paths.includes("Takeout/Google Photos/Photos from 2024/live.MOV"));
  assert.ok(paths.includes("Takeout/Google Photos/Đà Lạt/metadata.json"));
  assert.ok(paths.includes("Takeout/Google Photos/Đà Lạt/img.JPG"));
  assert.ok(!paths.some((p) => p.includes("Empty")));

  const sidecar = names.find((e) => e.name.endsWith("2023/IMG.jpg.json")).json;
  // Các trường `@tng/shared` sidecarMeta đọc khi nhập lại.
  assert.equal(sidecar.photoTakenTime.timestamp, String(Date.parse("2023-02-03T04:05:06Z") / 1000));
  assert.equal(sidecar.favorited, true);
  assert.equal(sidecar.description, "Biển");
  assert.deepEqual([sidecar.geoData.latitude, sidecar.geoData.longitude], [10, 106]);
  const manifest = names.at(-1).json;
  assert.deepEqual(manifest.labels[0].files, ["Takeout/Google Photos/Photos from 2023/IMG.jpg"]);
});

test("planExport: same name in one folder gets (2), case-insensitive", () => {
  const paths = planExport({ media: [m("1", "a.jpg"), m("2", "A.jpg")] }).map((e) => e.name);
  assert.ok(paths.includes("Takeout/Google Photos/Photos from 2024/A (2).jpg"));
  assert.ok(paths.includes("Takeout/Google Photos/Photos from 2024/A (2).jpg.json"));
});
