// Hàm thuần tính kích thước lưới ảnh của Thư viện (GalleryView).

/** Số cột theo bề rộng lưới + mật độ trong Cài đặt (mốc như Tailwind sm/lg/…). */
export function columnsFor(width: number, cols: readonly number[]) {
  if (width < 640) return cols[0];
  if (width < 1024) return cols[1];
  if (width < 1440) return cols[2];
  return cols[3];
}

/**
 * Kích thước 1 ô vuông + khoảng cách. Không làm tròn: ô thật của CSS grid rộng
 * đúng phân số này, làm tròn sẽ lệch dần chiều cao hàng ước lượng khi cuộn xa.
 * Mỗi hàng ảnh = ô + khoảng cách dọc (bằng khoảng cách ngang).
 */
export function gridMetrics(width: number, columns: number) {
  const gap = width >= 640 ? 12 : 8;
  const cell = Math.max(1, (width - (columns - 1) * gap) / columns);
  return { gap, cell, rowHeight: cell + gap };
}
