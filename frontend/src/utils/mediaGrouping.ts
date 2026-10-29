import type { Media } from "@/types";
import type { GallerySort } from "@/services/media";

export interface DisplayGridRow {
  type: "grid";
  key: string;
  items: Media[];
}

export interface DisplayHeaderRow {
  type: "header";
  key: string;
  label: string;
  /** Id mọi ảnh (đã tải) trong nhóm — nút "chọn cả nhóm". */
  ids: string[];
}

export type DisplayRow = DisplayGridRow | DisplayHeaderRow;

export interface GroupLabels {
  today: string;
  yesterday: string;
  thisWeek: string;
  thisMonth: string;
  undated: string;
}

const DAY_MS = 86_400_000;

// "Tháng 6, 2026" / "June 2026"
export function formatMonthYear(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    month: "long",
    year: "numeric",
  }).format(date);
}

interface Group {
  key: string;
  label: string;
  items: Media[];
}

function startOfDayMs(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

// Nhóm theo mốc thời gian kiểu Google Photos (theo ngày chụp nếu có).
// Tuần/tháng dùng rolling (7 ngày), còn "Tháng này" là tháng dương lịch hiện tại
// để các ảnh cùng tháng luôn gộp vào 1 header (tránh 2 header trùng tháng).
function dateBucket(
  item: Media,
  labels: GroupLabels,
  lang: string,
): { key: string; label: string } {
  // Nhóm theo NGÀY CHỤP (EXIF), không có thì ngày tải lên.
  const raw = item.takenAt ?? item.createdAt;
  const ts = raw ? new Date(raw).getTime() : NaN;
  if (!raw || Number.isNaN(ts)) {
    return { key: "__undated", label: labels.undated };
  }

  const date = new Date(ts);
  const now = new Date();
  const days = Math.round((startOfDayMs(now) - startOfDayMs(date)) / DAY_MS);

  if (days <= 0) return { key: "today", label: labels.today };
  if (days === 1) return { key: "yesterday", label: labels.yesterday };
  if (days < 7) return { key: "thisWeek", label: labels.thisWeek };

  const key = `month-${date.getFullYear()}-${date.getMonth()}`;
  const isCurrentMonth =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth();
  return {
    key,
    label: isCurrentMonth ? labels.thisMonth : formatMonthYear(date, lang),
  };
}

// Nhóm theo chữ cái đầu của tên (cho sort theo tên)
function nameBucket(item: Media): { key: string; label: string } {
  const name = (item.title || item.altText || "").trim();
  const up = name.charAt(0).toUpperCase();
  const label = /^[\p{L}\p{N}]+$/u.test(up) ? up : "#";
  return { key: label, label };
}

// Gộp các item liên tiếp cùng bucket thành 1 group (dữ liệu đã sort sẵn nên liền mạch)
function segmentize(
  mediaList: Media[],
  pick: (m: Media) => { key: string; label: string },
): Group[] {
  const groups: Group[] = [];
  for (const item of mediaList) {
    const bucket = pick(item);
    const last = groups[groups.length - 1];
    if (last && last.key === bucket.key) {
      last.items.push(item);
    } else {
      groups.push({ ...bucket, items: [item] });
    }
  }
  return groups;
}

// Biến mediaList thành danh sách hàng hiển thị (header + grid) cho virtualizer.
export function buildDisplayRows(
  mediaList: Media[],
  columns: number,
  sort: GallerySort,
  labels: GroupLabels,
  lang: string,
): DisplayRow[] {
  const byInitial = sort === "name_asc" || sort === "name_desc";
  const groups = segmentize(mediaList, (m) =>
    byInitial ? nameBucket(m) : dateBucket(m, labels, lang),
  );

  const rows: DisplayRow[] = [];
  for (const group of groups) {
    rows.push({
      type: "header",
      key: `h:${group.key}`,
      label: group.label,
      ids: group.items.map((m) => m.id),
    });
    for (let i = 0; i < group.items.length; i += columns) {
      const chunk = group.items.slice(i, i + columns);
      rows.push({
        type: "grid",
        key: `g:${group.key}:${i}:${chunk[0].id}`,
        items: chunk,
      });
    }
  }
  return rows;
}
