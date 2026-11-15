// pickMedia(): mở dialog chọn ảnh như gọi 1 hàm — `await pickMedia({ max: 1 })`
// → MediaListItem[] (null = huỷ). Dialog do <MediaPickerHost /> (MainLayout) vẽ.
import { type MediaListItem } from "@tng/shared";
import { create } from "zustand";
import type { MediaPickerOptions } from "./MediaPickerDialog";

export interface PickRequest extends MediaPickerOptions {
  resolve: (items: MediaListItem[] | null) => void;
}

export const usePickRequest = create<{ request: PickRequest | null }>(() => ({ request: null }));

export function pickMedia(options: MediaPickerOptions = {}): Promise<MediaListItem[] | null> {
  // Đang mở 1 yêu cầu khác → coi như huỷ yêu cầu cũ.
  usePickRequest.getState().request?.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const once = (items: MediaListItem[] | null) => {
      if (settled) return;
      settled = true;
      resolve(items);
    };
    usePickRequest.setState({ request: { ...options, resolve: once } });
  });
}
