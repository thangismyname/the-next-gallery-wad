import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AspectRatio, TimerOption } from "@tng/shared";

type CameraPrefs = {
  aspectRatio: AspectRatio;
  showGrid: boolean;
  timerDelay: TimerOption;
  setAspectRatio: (ratio: AspectRatio) => void;
  toggleGrid: () => void;
  cycleTimer: () => void;
};

const TIMER_ORDER: TimerOption[] = [0, 3, 5];

/**
 * Cài đặt Camera nhớ qua các lần mở (localStorage `tng.cameraPrefs`): tỉ lệ khung,
 * lưới, hẹn giờ. Lật gương KHÔNG lưu — nó đi theo camera đang dùng (trước = lật).
 */
export const useCameraPrefs = create<CameraPrefs>()(
  persist(
    (set) => ({
      aspectRatio: "free",
      showGrid: false,
      timerDelay: 0,
      setAspectRatio: (aspectRatio) => set({ aspectRatio }),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      cycleTimer: () =>
        set((s) => ({
          timerDelay: TIMER_ORDER[(TIMER_ORDER.indexOf(s.timerDelay) + 1) % TIMER_ORDER.length],
        })),
    }),
    {
      name: "tng.cameraPrefs",
      partialize: ({ aspectRatio, showGrid, timerDelay }) => ({ aspectRatio, showGrid, timerDelay }),
    },
  ),
);
