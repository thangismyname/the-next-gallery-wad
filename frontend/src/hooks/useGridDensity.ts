// hooks/useGridDensity.ts
// Mật độ lưới ảnh (cài đặt giao diện) — persist vào localStorage, dùng ở
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

function readStored(): GridDensity {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as GridDensity | null;
    return value && DENSITIES.includes(value) ? value : "comfortable";
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
      localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* localStorage có thể bị chặn — bỏ qua */
    }
    set({ density });
  },
}));
