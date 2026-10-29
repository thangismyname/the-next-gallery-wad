// Hàm định dạng hiển thị dùng chung toàn app (dung lượng, thời lượng, ngày,
// đếm ngược, tốc độ). Hàm thuần — không phụ thuộc React / trình duyệt.

/** 512 B / 3.4 KB / 1.2 MB / 1.10 GB — dung lượng file dễ đọc. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** 0:42 / 12:05 — thời lượng video, đồng hồ đếm ngược ngắn. Không có giá trị → "". */
export function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return "";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 01:05:09 hoặc "2d 01:05:09" — đếm ngược dài (hạn link mời). Hết hạn → 00:00:00. */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const pad = (n: number) => String(n).padStart(2, "0");
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** 1.2 MB/s hoặc 640 KB/s — tốc độ truyền file. */
export function formatSpeed(bytesPerSec: number): string {
  const mb = bytesPerSec / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bytesPerSec / 1024)} KB/s`;
}

/** "1m 05s" / "42s" — thời gian còn lại. Không xác định → "—". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "29 thg 10, 2026" — ngày ngắn theo ngôn ngữ. Không có → "—". */
export function formatDate(value: string | Date | null | undefined, locale?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "29 tháng 10, 2026, 14:05" — ngày + giờ đầy đủ. Không có / sai → "". */
export function formatDateTime(value?: string | null, locale?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 giờ trước", "2 days ago"… — dưới 1 phút = "bây giờ". Không có → "—". */
export function formatRelative(value: string | Date | null | undefined, locale?: string) {
  if (!value) return "—";
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}
