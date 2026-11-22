import type { Album, AutoAlbum, AutoAlbumGroup } from "../services/albums";
import type { Translate } from "./i18n";

/** Tên hiển thị của album tự động (đã dịch) — dựng từ key + khoảng ngày. */
export function autoAlbumName(
  album: Pick<AutoAlbum, "key" | "firstAt" | "lastAt">,
  t: Translate,
  locale: string,
): string {
  const dash = album.key.indexOf("-");
  const kind = album.key.slice(0, dash);
  const value = album.key.slice(dash + 1);

  switch (kind) {
    case "type":
      return t(`albums.auto.type.${value}`);
    case "tag":
      return value === "other"
        ? t("albums.auto.otherTag")
        : t(`studio.tags.${value}`, { defaultValue: value });
    case "object":
      return t(`albums.auto.objects.${value}`, { defaultValue: value });
    case "month": {
      const [year, month] = value.split("-").map(Number);
      const label = new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date(year, month - 1, 1));
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    case "event": {
      const first = new Date(album.firstAt);
      const last = new Date(album.lastAt);
      const full = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      // Cùng ngày → 1 ngày; khác ngày → "6 thg 2 – 7 thg 2, 2026" (bỏ năm ở đầu nếu trùng).
      const date =
        first.toDateString() === last.toDateString()
          ? full.format(first)
          : `${(first.getFullYear() === last.getFullYear()
              ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
              : full
            ).format(first)} – ${full.format(last)}`;
      return t("albums.auto.event", { date });
    }
    default:
      return album.key;
  }
}

/** One album a photo picker can open: a regular album (own + shared) or an auto album. */
export interface PickAlbum {
  /** Unique in the list: `album:<id>` | `auto:<key>`. */
  key: string;
  source: "album" | "auto";
  /** Album id (source album) or auto-album key (source auto). */
  id: string;
  name: string;
  count: number;
  /** Auto albums: their group (content / objects / time / type). */
  group: AutoAlbumGroup | null;
}

const PICK_GROUP_ORDER: AutoAlbumGroup[] = ["content", "objects", "time", "type"];

/**
 * Albums to pick photos from (web picker "Album ▾", mobile chips): regular albums first, then the
 * auto albums by group (content → objects → time → type), empty ones skipped. Smart albums are left
 * out (they are a saved search — type it instead).
 */
export function pickAlbums(
  lists: { owned: Album[]; shared: Album[] } | undefined,
  groups: { id: AutoAlbumGroup; albums: AutoAlbum[] }[] | undefined,
  t: Translate,
  locale: string,
): PickAlbum[] {
  const regular: PickAlbum[] = [...(lists?.owned ?? []), ...(lists?.shared ?? [])]
    .filter((a) => a.kind === "manual")
    .map((a) => ({ key: `album:${a.id}`, source: "album", id: a.id, name: a.name, count: a.mediaCount ?? 0, group: null }));
  const auto = PICK_GROUP_ORDER.flatMap((id) =>
    (groups?.find((g) => g.id === id)?.albums ?? [])
      .filter((a) => a.count > 0)
      .map<PickAlbum>((a) => ({ key: `auto:${a.key}`, source: "auto", id: a.key, name: autoAlbumName(a, t, locale), count: a.count, group: id })),
  );
  return [...regular, ...auto];
}
