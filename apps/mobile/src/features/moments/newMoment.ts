// Tạo moment mới (menu "Thêm" ở header): chụp trong Camera (chế độ Moment) hoặc 1 ảnh / video thư viện.
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";

import type { MomentDraft } from "@/features/camera/useCameraCapture";

/** Mở tab Camera ở chế độ Moment (chạm = ảnh, giữ = video 5 s). */
export const openMomentCamera = () => router.navigate({ pathname: "/camera", params: { mode: "moments" } });

/** 1 ảnh / video thư viện → cùng màn duyệt với camera (khung + caption + Đăng). null = huỷ. */
export async function pickMomentDraft(): Promise<MomentDraft | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, video: asset.type === "video" } : null;
}
