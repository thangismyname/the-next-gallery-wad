import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Settings2 } from "lucide-react";
import { fetchMediaLabels, mediaLabelsQueryKey } from "@/services/labels";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "../labelColors";
import { useLabelActions, useLabels } from "../useLabels";
import { useLabelManager } from "../useLabelManager";

/**
 * Lightbox → Chi tiết: bấm chip để gắn / gỡ nhãn cá nhân. Ảnh người khác
 * (album chung), ảnh trong thùng rác, link công khai → ẩn.
 */
export function MediaLabelsSection({ mediaId, active }: { mediaId: string; active: boolean }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: mediaLabelsQueryKey(mediaId),
    queryFn: () => fetchMediaLabels(mediaId),
    enabled: active,
    retry: false,
    staleTime: 30_000,
  });
  const { labels } = useLabels(active && Boolean(data?.editable));
  const { toggleMedia } = useLabelActions();
  const openManager = useLabelManager((s) => s.setOpen);

  if (!data?.editable) return null;

  return (
    <div className="border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Bookmark size={13} className="text-white/40" />
        <p className="flex-1 text-[11px] tracking-wide text-white/40 uppercase">
          {t("favorites.labels.title")}
        </p>
        <button
          type="button"
          onClick={() => openManager(true)}
          className="rounded p-0.5 text-white/40 transition-colors hover:text-white"
          aria-label={t("favorites.labels.manage")}
          title={t("favorites.labels.manage")}
        >
          <Settings2 size={13} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => {
          const on = data.labelIds.includes(label.id);
          return (
            <button
              key={label.id}
              type="button"
              aria-pressed={on}
              onClick={() => void toggleMedia(label.id, [mediaId], !on).catch(() => {})}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors active:scale-95",
                on
                  ? "border-white/30 bg-white/15 text-white"
                  : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80",
              )}
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full transition-opacity",
                  LABEL_DOT[label.color],
                  !on && "opacity-50",
                )}
              />
              <span className="max-w-40 truncate">{label.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
