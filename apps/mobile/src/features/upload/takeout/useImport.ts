import { createImportStore, isTakeoutVideo, type ImportSource, type TakeoutEntry } from "@tng/shared";
import { Directory, File } from "expo-file-system";

import { queryClient } from "@/lib/queryClient";
import { albumsApi, importsApi } from "@/services";
import { sendMediaParts, type RnPart } from "@/services/upload";

import { galleryKeys } from "../../gallery/useGalleryMedia";
import { describeFile } from "../useUploadQueue";

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const refreshGallery = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: galleryKeys.all }), 1500);
};

/**
 * Google Takeout import on the phone — the shared engine (`@tng/shared` `import/engine.ts`) with
 * a phone-folder source + RN uploads. Global store: the run keeps going after the screen closes.
 */
export const useImport = createImportStore<RnPart>({
  client: "mobile",
  imports: importsApi,
  listAlbums: async () => (await albumsApi.fetchAlbums()).owned.filter((a) => a.kind === "manual"),
  createAlbum: async (name) => (await albumsApi.createAlbum({ name })).id,
  upload: (parts, meta, signal) => sendMediaParts(parts, meta, { signal }),
  onUploaded: refreshGallery,
});

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The extracted Takeout folder the user picked (Files app / SAF). */
export function folderSource(root: Directory): ImportSource<RnPart> {
  const files = new Map<string, File>();
  return {
    list: async (onCount) => {
      const entries: TakeoutEntry[] = [];
      const stack: [Directory, string][] = [[root, ""]];
      while (stack.length) {
        const [dir, prefix] = stack.pop()!;
        for (const child of dir.list()) {
          const path = prefix ? `${prefix}/${child.name}` : child.name;
          if (child instanceof Directory) stack.push([child, path]);
          else {
            files.set(path, child);
            entries.push({ path, size: child.size });
          }
        }
        onCount(entries.length);
        await yieldToUi();
      }
      return entries;
    },
    readText: async (path) => {
      const file = files.get(path);
      if (!file) throw new Error(`missing ${path}`);
      return file.text();
    },
    prepare: async (path) => {
      const file = files.get(path);
      if (!file?.exists) throw new Error(`missing ${path}`);
      const { name, type } = describeFile(file.uri, { name: file.name, type: file.type || null, video: isTakeoutVideo(path) });
      return { uri: file.uri, name, type };
    },
  };
}
