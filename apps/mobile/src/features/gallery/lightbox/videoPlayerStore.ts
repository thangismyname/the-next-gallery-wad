// Player của video đang mở trong Lightbox (chỉ trang hiện tại mount player) → `VideoControls` vẽ ở
// cấp màn hình (trên thanh công cụ, ngoài phần zoom của trang) mà vẫn điều khiển được nó.
import { clampVolume, type VideoSpeed } from "@tng/shared";
import type { VideoPlayer, VideoView } from "expo-video";
import type { RefObject } from "react";
import { create } from "zustand";

export interface VideoPrefs {
  volume: number;
  muted: boolean;
  rate: VideoSpeed;
}

interface State extends VideoPrefs {
  player: VideoPlayer | null;
  /** View của player (nút toàn màn hình). */
  view: RefObject<VideoView | null> | null;
  /** Đang ở trình phát toàn màn hình mặc định của iOS / Android → bật điều khiển gốc (có nút thoát). */
  nativeUi: boolean;
  /** Mở trình phát toàn màn hình mặc định (điều khiển gốc đầy đủ). */
  openNative: () => void;
  /** Thoát toàn màn hình → về điều khiển của app. */
  closeNative: () => void;
  /** Trang video mount → nhận lựa chọn đang nhớ; unmount → null. */
  attach: (player: VideoPlayer | null, view?: RefObject<VideoView | null>) => void;
  set: (patch: Partial<VideoPrefs>) => void;
}

export const useVideoPlayerStore = create<State>((set, get) => ({
  player: null,
  view: null,
  nativeUi: false,
  openNative: () => {
    // Bật điều khiển gốc TRƯỚC rồi mới vào toàn màn hình — không có thì trình phát hệ thống không
    // có nút nào (kể cả nút thoát).
    set({ nativeUi: true });
    requestAnimationFrame(() => {
      const view = get().view?.current;
      if (!view) return get().closeNative();
      // Không vào được (vd view vừa unmount) → trả lại điều khiển của app, không kẹt nửa vời.
      view.enterFullscreen().catch(() => get().closeNative());
    });
  },
  closeNative: () => set({ nativeUi: false }),
  volume: 1,
  muted: false,
  rate: 1,
  attach: (player, view) => {
    if (player) {
      const { volume, muted, rate } = get();
      player.volume = volume;
      player.muted = muted;
      player.playbackRate = rate;
    }
    set({ player, view: player ? (view ?? null) : null, nativeUi: false });
  },
  set: (patch) => {
    const { player } = get();
    const next = { ...patch, ...(patch.volume !== undefined ? { volume: clampVolume(patch.volume) } : {}) };
    if (player) {
      if (next.volume !== undefined) player.volume = next.volume;
      if (next.muted !== undefined) player.muted = next.muted;
      if (next.rate !== undefined) player.playbackRate = next.rate;
    }
    set(next);
  },
}));
