import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AspectRatio, TimerOption } from "@tng/shared";
import type { FlashMode } from "expo-camera";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const FLASH_ORDER: FlashMode[] = ["off", "auto", "on"];
const TIMER_ORDER: TimerOption[] = [0, 3, 5];

type CameraPrefs = {
  flash: FlashMode;
  showGrid: boolean;
  timer: TimerOption;
  /** Photo frame (photos are cropped to it; videos are not). */
  ratio: AspectRatio;
  setRatio: (ratio: AspectRatio) => void;
  cycleFlash: () => void;
  toggleGrid: () => void;
  cycleTimer: () => void;
};

const next = <T,>(order: T[], value: T) => order[(order.indexOf(value) + 1) % order.length];

/** Camera settings remembered across launches (same options as the web camera). */
export const useCameraPrefs = create<CameraPrefs>()(
  persist(
    (set) => ({
      flash: "off",
      showGrid: false,
      timer: 0,
      ratio: "free",
      setRatio: (ratio) => set({ ratio }),
      cycleFlash: () => set((s) => ({ flash: next(FLASH_ORDER, s.flash) })),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      cycleTimer: () => set((s) => ({ timer: next(TIMER_ORDER, s.timer) })),
    }),
    {
      name: "tng.cameraPrefs",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ flash, showGrid, timer, ratio }) => ({ flash, showGrid, timer, ratio }),
    },
  ),
);
