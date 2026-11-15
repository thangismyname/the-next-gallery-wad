// hooks/useGridDensity.ts
// Mật độ lưới ảnh (cài đặt giao diện) — persist vào storage (web: localStorage,
// mobile: AsyncStorage qua setGridDensityStorage), dùng ở
// Gallery (số cột theo bề rộng) và Favorites/Trash (class grid tĩnh).
import { create } from "zustand";

export type GridDensity = "compact" | "comfortable" | "large";

const STORAGE_KEY = "tng.gridDensity";
const DENSITIES: GridDensity[] = ["compact", "comfortable", "large"];

/** Số cột Gallery theo bề rộng: [<640, <1024, <1440, ≥1440]. */
export const GALLERY_COLUMNS: Record<GridDensity, readonly number[]> = {
  compact: [4, 6, 7, 8],
  comfortable: [3, 4, 5, 6],
  large: [2, 3, 4, 4],
};

/** Class grid cho các trang lưới đơn giản (Favorites, Trash). */
export const GRID_DENSITY_CLASS: Record<GridDensity, string> = {
  compact: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-7",
  comfortable: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
  large: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
};

/**
 * Where the choice is persisted. Web: localStorage (default, read synchronously at
 * startup). Mobile has no localStorage — it calls
 * `setGridDensityStorage(AsyncStorage)` once at startup (async getItem is fine).
 */
export interface GridDensityStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

const isDensity = (value: unknown): value is GridDensity =>
  DENSITIES.includes(value as GridDensity);

let storage: GridDensityStorage | null =
  typeof localStorage !== "undefined" ? localStorage : null;

function readStored(): GridDensity {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isDensity(value) ? value : "comfortable";
  } catch {
    return "comfortable";
  }
}

interface GridDensityState {
  density: GridDensity;
  setDensity: (density: GridDensity) => void;
}

export const useGridDensity = create<GridDensityState>((set) => ({
  density: readStored(),
  setDensity: (density) => {
    try {
      void storage?.setItem(STORAGE_KEY, density);
    } catch {
      /* storage có thể bị chặn — bỏ qua */
    }
    set({ density });
  },
}));

/** Swap the persistence backend (mobile) and load the saved value from it. */
export async function setGridDensityStorage(next: GridDensityStorage): Promise<void> {
  storage = next;
  try {
    const value = await next.getItem(STORAGE_KEY);
    if (isDensity(value)) useGridDensity.setState({ density: value });
  } catch {
    /* giữ giá trị mặc định */
  }
}
