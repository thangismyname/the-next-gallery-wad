import type { TFunction } from "i18next";
import type { AutoAlbum } from "@/services/albums";

/** Tên hiển thị của album tự động (đã dịch) — dựng từ key + khoảng ngày. */
export function autoAlbumName(
  album: Pick<AutoAlbum, "key" | "firstAt" | "lastAt">,
  t: TFunction,
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
