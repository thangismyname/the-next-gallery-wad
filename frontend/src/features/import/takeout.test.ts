import { describe, expect, it } from "vitest";
import { albumTitle, itemsForMode, matchSidecar, planTakeout, sidecarMeta } from "@tng/shared";

describe("matchSidecar", () => {
  it("plain and supplemental-metadata names", () => {
    expect(matchSidecar("IMG_1.jpg", ["IMG_1.jpg.json", "IMG_10.jpg.json"])).toBe("IMG_1.jpg.json");
    expect(matchSidecar("IMG_1.jpg", ["IMG_1.jpg.supplemental-metadata.json"])).toBe("IMG_1.jpg.supplemental-metadata.json");
    expect(matchSidecar("IMG_1.jpg", ["IMG_10.jpg.json"])).toBeNull();
  });
  it("truncated JSON names (Takeout keeps ~46 chars)", () => {
    const media = "PXL_20230715_101530123.PORTRAIT.ORIGINAL.jpg";
    expect(matchSidecar(media, ["PXL_20230715_101530123.PORTRAIT.ORIGINAL.jpg.su.json"])).toBe(
      "PXL_20230715_101530123.PORTRAIT.ORIGINAL.jpg.su.json",
    );
    expect(matchSidecar("a_very_long_original_file_name_that_got_cut_off.jpg", ["a_very_long_original_file_name_that_got_cut.json"])).toBe(
      "a_very_long_original_file_name_that_got_cut.json",
    );
  });
  it("(n) counter moved after the extension", () => {
    const jsons = ["IMG_1.jpg.json", "IMG_1.jpg(1).json", "IMG_1.jpg.supplemental-metadata(2).json"];
    expect(matchSidecar("IMG_1(1).jpg", jsons)).toBe("IMG_1.jpg(1).json");
    expect(matchSidecar("IMG_1(2).jpg", jsons)).toBe("IMG_1.jpg.supplemental-metadata(2).json");
    expect(matchSidecar("IMG_1.jpg", jsons)).toBe("IMG_1.jpg.json");
  });
  it("edited copy and live-photo video use the original's JSON", () => {
    expect(matchSidecar("IMG_2-edited.jpg", ["IMG_2.jpg.json"])).toBe("IMG_2.jpg.json");
    expect(matchSidecar("IMG_3.MP4", ["IMG_3.HEIC.json"])).toBe("IMG_3.HEIC.json");
    expect(matchSidecar("IMG_3.HEIC", ["IMG_3.HEIC.json", "IMG_3.MP4.json"])).toBe("IMG_3.HEIC.json");
  });
});

describe("sidecarMeta / albumTitle", () => {
  it("reads photoTakenTime + favorited", () => {
    expect(sidecarMeta({ photoTakenTime: { timestamp: "1562000000" }, favorited: true })).toEqual({
      takenAt: "2019-07-01T16:53:20.000Z",
      favorite: true,
    });
    expect(sidecarMeta({ photoTakenTime: { timestamp: "0" } })).toEqual({});
    expect(sidecarMeta(null)).toEqual({});
  });
  it("reads description and location (0,0 = none, falls back to geoDataExif)", () => {
    expect(sidecarMeta({ description: " Dinner ", geoData: { latitude: 0, longitude: 0 }, geoDataExif: { latitude: 10.77, longitude: 106.7 } })).toEqual({
      description: "Dinner",
      location: { lat: 10.77, lng: 106.7 },
    });
    expect(sidecarMeta({ description: "", geoData: { latitude: 0, longitude: 0 } })).toEqual({});
  });
  it("album title falls back to the folder name", () => {
    expect(albumTitle({ title: " Đà Lạt " }, "x")).toBe("Đà Lạt");
    expect(albumTitle({}, "Folder")).toBe("Folder");
  });
});

describe("planTakeout", () => {
  it("uploads a photo once with every album it is in", () => {
    const plan = planTakeout([
      { path: "Google Photos/Photos from 2019/IMG_1.jpg", size: 10 },
      { path: "Google Photos/Photos from 2019/IMG_1.jpg.json" },
      { path: "Google Photos/Trip/IMG_1.jpg", size: 10 },
      { path: "Google Photos/Trip/IMG_1.jpg.json" },
      { path: "Google Photos/Trip/metadata.json" },
      { path: "Google Photos/Photos from 2019/IMG_2.mp4", size: 5 },
      { path: "Google Photos/print-subscriptions.json" },
      { path: "Google Photos/Photos from 2019/notes.txt" },
    ]);
    expect(plan.items).toEqual([
      { path: "Google Photos/Photos from 2019/IMG_1.jpg", size: 10, jsonPath: "Google Photos/Photos from 2019/IMG_1.jpg.json", albumFolders: ["Google Photos/Trip"], motionPath: null, edited: false, hasEdited: false },
      { path: "Google Photos/Photos from 2019/IMG_2.mp4", size: 5, jsonPath: null, albumFolders: [], motionPath: null, edited: false, hasEdited: false },
    ]);
    expect(plan.albums).toEqual([{ folder: "Google Photos/Trip", name: "Trip", metadataPath: "Google Photos/Trip/metadata.json" }]);
    expect(plan.stats).toEqual({ media: 2, videos: 1, duplicates: 1, missingJson: 1, skipped: 1, livePhotos: 0, edited: 0 });
  });
});

describe("planTakeout: live photos + edited copies", () => {
  const plan = planTakeout([
    { path: "P/IMG_1.HEIC", size: 1 },
    { path: "P/IMG_1.MOV", size: 2 },
    { path: "P/IMG_2.jpg", size: 3 },
    { path: "P/IMG_2-edited.jpg", size: 4 },
    { path: "P/clip.mp4", size: 5 },
  ]);
  it("pairs HEIC + MOV of the same name into one item", () => {
    const live = plan.items.find((i) => i.path === "P/IMG_1.HEIC")!;
    expect(live.motionPath).toBe("P/IMG_1.MOV");
    expect(plan.items.some((i) => i.path === "P/IMG_1.MOV")).toBe(false);
    expect(plan.stats).toMatchObject({ media: 4, videos: 1, livePhotos: 1, edited: 1 });
  });
  it("edited mode picks original / edited / both", () => {
    const paths = (mode: "both" | "original" | "edited") => itemsForMode(plan.items, mode).map((i) => i.path).sort();
    expect(paths("original")).toEqual(["P/IMG_1.HEIC", "P/IMG_2.jpg", "P/clip.mp4"]);
    expect(paths("edited")).toEqual(["P/IMG_1.HEIC", "P/IMG_2-edited.jpg", "P/clip.mp4"]);
    expect(paths("both")).toHaveLength(4);
  });
});
