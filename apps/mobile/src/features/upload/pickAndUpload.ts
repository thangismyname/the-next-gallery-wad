import * as ImagePicker from "expo-image-picker";

import { describeFile, useUploadQueue } from "./useUploadQueue";

/**
 * System photo picker (multi-select, photos + videos) → upload queue.
 * iOS: `Current` representation keeps the original file (HEIC / MOV with EXIF,
 * the backend reads the taken date from it) instead of a JPEG re-encode.
 * The iOS picker runs out of process → no Photos permission needed.
 * Returns the number of files queued (0 = cancelled).
 */
export async function pickAndUpload(): Promise<number> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: 100,
    orderedSelection: true,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled) return 0;
  const sources = result.assets.map((asset) => {
    const video = asset.type === "video";
    const { name, type } = describeFile(asset.uri, { name: asset.fileName, type: asset.mimeType, video });
    return { uri: asset.uri, name, type, preview: video ? null : asset.uri };
  });
  useUploadQueue.getState().enqueue(sources);
  return sources.length;
}
