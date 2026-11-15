import type { GallerySort, MediaListItem } from "@tng/shared";

/** Rows for the virtualized gallery list: a day header, then rows of `columns` tiles. */
export type GalleryRow =
  | { type: "header"; key: string; label: string; count: number; first: boolean }
  | { type: "grid"; key: string; items: MediaListItem[] };

export interface DayLabels {
  today: string;
  yesterday: string;
  undated: string;
}

const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** "Hôm nay" / "Hôm qua" / "Th 4, 12 thg 11" (+ year when not this year). */
export function dayLabel(date: Date, now: Date, labels: DayLabels, lang: string): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) return labels.today;
  if (days === 1) return labels.yesterday;
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return capitalize(new Intl.DateTimeFormat(lang, options).format(date));
}

/** Local-day key of a media item: taken date (EXIF) first, else upload date — same rule as the web. */
function dayKey(item: MediaListItem): { key: string; date: Date | null } {
  const raw = item.takenAt ?? item.createdAt;
  const ts = raw ? new Date(raw).getTime() : NaN;
  if (Number.isNaN(ts)) return { key: "undated", date: null };
  const date = new Date(ts);
  return { key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, date };
}

/** First letter of the title ("#" for digits / symbols) — sections for name sorts, like the web. */
function initialKey(item: MediaListItem): string {
  const first = (item.title ?? "").trim().charAt(0).toLocaleUpperCase();
  return /^\p{L}$/u.test(first) ? first : "#";
}

/**
 * Groups consecutive items (the API already sorts them) and splits each group into
 * rows of `columns`. Date sorts → one group per local day (`takenAt ?? createdAt`);
 * name sorts → one group per first letter.
 */
export function buildGalleryRows(
  items: MediaListItem[],
  columns: number,
  sort: GallerySort,
  labels: DayLabels,
  lang: string,
  now = new Date(),
): GalleryRow[] {
  const byName = sort === "name_asc" || sort === "name_desc";
  const groups: { key: string; label: string; items: MediaListItem[] }[] = [];
  for (const item of items) {
    let key: string;
    let label: () => string;
    if (byName) {
      key = initialKey(item);
      label = () => key;
    } else {
      const day = dayKey(item);
      key = day.key;
      label = () => (day.date ? dayLabel(day.date, now, labels, lang) : labels.undated);
    }
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: label(), items: [item] });
  }

  const rows: GalleryRow[] = [];
  groups.forEach((group, groupIndex) => {
    // Same day can reappear if sort keys tie oddly — keep keys unique.
    const id = `${group.key}#${groupIndex}`;
    rows.push({
      type: "header",
      key: `h:${id}`,
      label: group.label,
      count: group.items.length,
      first: groupIndex === 0,
    });
    for (let i = 0; i < group.items.length; i += columns) {
      const chunk = group.items.slice(i, i + columns);
      rows.push({ type: "grid", key: `g:${id}:${chunk[0].id}`, items: chunk });
    }
  });
  return rows;
}
