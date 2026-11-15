import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { tagColor, isLabelTag, mediaTagsQueryKey, type MediaTag } from "@tng/shared";
import { TAG_CHIP } from "@/lib/aiColors";
import { popIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fetchMediaTags } from "@/services/media";
import { useTagCatalog } from "../useTagCatalog";

// Nhãn dưới ngưỡng: chỉ hiện vài cái mạnh nhất (mờ, viền đứt) để người xem biết model "nghĩ gì".
const MAX_WEAK = 4;

type Props = { mediaId: string; fallback: string[]; active: boolean };

/**
 * Tag nội dung của ảnh trong Lightbox: 17 danh mục + nhãn chi tiết, kèm % độ tin
 * cậy. Ảnh không phải của mình (album chia sẻ) → API trả rỗng → hiện `fallback`
 * (aiTags có sẵn trong item).
 */
export const MediaAiTagsSection: React.FC<Props> = ({ mediaId, fallback, active }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { describe } = useTagCatalog();
  const { data = [] } = useQuery({
    queryKey: mediaTagsQueryKey(mediaId),
    queryFn: () => fetchMediaTags(mediaId),
    enabled: active,
    staleTime: 60_000,
  });

  const rows: MediaTag[] =
    data.length > 0 ? data : fallback.map((tag) => ({ tag, confidence: 1, threshold: 0 }));
  const known = rows.filter((r) => describe(r.tag));
  const strong = known.filter((r) => r.confidence >= r.threshold);
  const weak = known.filter((r) => r.confidence < r.threshold).slice(0, MAX_WEAK);
  const groups = [
    { key: "categories", items: strong.filter((r) => !isLabelTag(r.tag)) },
    { key: "labels", items: strong.filter((r) => isLabelTag(r.tag)) },
    { key: "weak", items: weak },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;

  let index = 0;
  return (
    <div className="pt-3 border-t border-foreground/10 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} className="text-foreground/40" />
        <p className="text-[11px] uppercase tracking-wide text-foreground/40">
          {t("lightbox.detailTags")}
        </p>
      </div>
      {groups.map(({ key, items }) => (
        <div key={key} className="flex flex-wrap gap-1.5">
          {items.map((row) => {
            const display = describe(row.tag)!;
            const pct = Math.round(row.confidence * 100);
            const isWeak = key === "weak";
            const showPct = data.length > 0;
            return (
              <motion.span
                key={`${mediaId}-${row.tag}`}
                {...popIn(index++, reduce, 0.03)}
                title={
                  isWeak
                    ? t("lightbox.tagBelowThreshold", { pct, thr: Math.round(row.threshold * 100) })
                    : showPct
                      ? `${pct}%`
                      : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                  isWeak
                    ? "border border-dashed border-foreground/15 text-foreground/40"
                    : TAG_CHIP[tagColor(row.tag, display.label?.section)],
                  key === "categories" && "font-medium",
                )}
              >
                <display.Icon size={11} className="opacity-70" />
                {display.name}
                {showPct && <span className="tabular-nums opacity-60">{pct}%</span>}
              </motion.span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
