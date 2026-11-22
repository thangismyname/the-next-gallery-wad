// hooks/useGridDensity.ts
// Mật độ lưới ảnh (cài đặt giao diện) — persist vào storage (web: localStorage,
// mobile: AsyncStorage qua setGridDensityStorage), dùng ở
// Gallery (số cột theo bề rộng) và Favorites/Trash (class grid tĩnh).
import { create } from "zustand";

export type GridDensity = "compact" | "comfortable" | "large";
/** Kiểu lưới Thư viện: `grid` = ô vuông cắt ảnh (hiện tại) · `justified` = giữ tỉ lệ ảnh, hàng cao bằng nhau
 *  (CHƯA LÀM — chỗ chờ sẵn; item đã có width/height để tính hàng). */
export type GalleryLayout = "grid" | "justified";
/** Layout đã làm xong — option khác hiện "Sắp có" và không chọn được. */
export const GALLERY_LAYOUTS_READY: readonly GalleryLayout[] = ["grid"];

const STORAGE_KEY = "tng.gridDensity";
const LAYOUT_KEY = "tng.galleryLayout";
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

const isReadyLayout = (value: unknown): value is GalleryLayout =>
  GALLERY_LAYOUTS_READY.includes(value as GalleryLayout);

function readLayout(): GalleryLayout {
  try {
    const value = storage?.getItem(LAYOUT_KEY);
    return isReadyLayout(value) ? value : "grid";
  } catch {
    return "grid";
  }
}

interface GridDensityState {
  density: GridDensity;
  setDensity: (density: GridDensity) => void;
  layout: GalleryLayout;
  setLayout: (layout: GalleryLayout) => void;
}

export const useGridDensity = create<GridDensityState>((set) => ({
  layout: readLayout(),
  setLayout: (layout) => {
    if (!isReadyLayout(layout)) return; // layout chưa làm → giữ nguyên
    try {
      void storage?.setItem(LAYOUT_KEY, layout);
    } catch {
      /* storage có thể bị chặn — bỏ qua */
    }
    set({ layout });
  },
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
    const layout = await next.getItem(LAYOUT_KEY);
    if (isReadyLayout(layout)) useGridDensity.setState({ layout });
  } catch {
    /* giữ giá trị mặc định */
  }
}
