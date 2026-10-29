import { Heart } from "lucide-react";
import type { UserLabel } from "@/services/labels";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "../labelColors";

/** Góc ô ảnh trang Yêu thích: tim + chấm màu các nhãn (tối đa 4) — vì sao ảnh nằm ở đây. */
export function LabelDots({
  labelIds,
  labels,
  favorite,
}: {
  labelIds: string[];
  labels: UserLabel[];
  favorite: boolean;
}) {
  const shown = labels.filter((l) => labelIds.includes(l.id));
  if (!favorite && shown.length === 0) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 backdrop-blur-xs">
      {favorite && <Heart className="size-3 fill-rose-500 text-rose-500" />}
      {shown.slice(0, 4).map((l) => (
        <span
          key={l.id}
          title={l.name}
          className={cn("size-2 rounded-full ring-1 ring-white/70", LABEL_DOT[l.color])}
        />
      ))}
    </span>
  );
}
