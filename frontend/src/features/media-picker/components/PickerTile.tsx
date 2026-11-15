// 1 ô ảnh trong picker — memo: chỉ render lại khi chính ô này đổi trạng thái
// (chọn / khoá), không phải cả lưới mỗi lần bấm.
import React, { memo, useState } from "react";
import { Check, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, type MediaListItem } from "@tng/shared";

interface PickerTileProps {
  item: MediaListItem;
  index: number;
  selected: boolean;
  /** Đã đủ số ảnh tối đa → ô chưa chọn bị khoá. */
  locked: boolean;
  size: number;
  onPress: (index: number, shiftKey: boolean) => void;
}

export const PickerTile = memo(function PickerTile({
  item,
  index,
  selected,
  locked,
  size,
  onPress,
}: PickerTileProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => onPress(index, e.shiftKey)}
      disabled={locked && !selected}
      aria-pressed={selected}
      title={item.title ?? ""}
      style={{ width: size, height: size }}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        locked && !selected && "cursor-not-allowed opacity-40",
      )}
    >
      <img
        src={item.thumbnailUrl}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "size-full object-cover transition-[opacity,transform] duration-200",
          loaded ? "opacity-100" : "opacity-0",
          selected && "scale-[0.88] rounded-md",
        )}
      />
      {item.mediaType === "video" && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
          <Play className="size-2.5 fill-current" />
          {item.durationSeconds ? formatDuration(item.durationSeconds) : null}
        </span>
      )}
      <span
        className={cn(
          "absolute top-1 right-1 flex size-5 items-center justify-center rounded-full border-2 transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/80 bg-black/20",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
});
