import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Film, Heart } from "lucide-react";
import { Media } from "../../../types";
import { cn } from "@/lib/utils";

interface LightboxFilmstripProps {
  mediaList: Media[];
  activeIndex: number;
  currentIndex: number;
  visible: boolean;
  onSelect?: (index: number) => void;
}

// Dải phim dưới lightbox: kéo ngang tay để cuộn, tap vào ảnh để jump.
const LightboxFilmstrip: React.FC<LightboxFilmstripProps> = ({
  mediaList,
  activeIndex,
  currentIndex,
  visible,
  onSelect,
}) => {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragGesture = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    scrollLeft: 0,
  });

  const onStripPointerDown = (e: React.PointerEvent) => {
    const el = stripRef.current;
    if (!el) return;
    dragGesture.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onStripPointerMove = (e: React.PointerEvent) => {
    const el = stripRef.current;
    const gesture = dragGesture.current;
    if (!el || !gesture.dragging) return;
    const dx = e.clientX - gesture.startX;
    if (Math.abs(dx) > 4) gesture.moved = true;
    el.scrollLeft = gesture.scrollLeft - dx;
  };

  const onStripPointerUp = () => {
    dragGesture.current.dragging = false;
  };

  const jumpTo = (index: number) => {
    if (dragGesture.current.moved) return;
    onSelect?.(index);
  };

  // Tự cuộn ảnh đang xem về giữa dải phim
  useEffect(() => {
    const strip = stripRef.current;
    const gesture = dragGesture.current;
    if (!strip || gesture.dragging) return;
    const activeEl = strip.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIndex, mediaList.length]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "relative shrink-0 w-full bg-black/60 backdrop-blur-md touch-pan-x cursor-grab active:cursor-grabbing",
        "transition-[height,opacity] duration-300 ease-out overflow-hidden",
        visible ? "h-20 opacity-100" : "h-0 opacity-0",
      )}
    >
      <div
        ref={stripRef}
        onPointerDown={onStripPointerDown}
        onPointerMove={onStripPointerMove}
        onPointerUp={onStripPointerUp}
        onPointerCancel={onStripPointerUp}
        onPointerLeave={onStripPointerUp}
        className="flex h-full overflow-x-auto"
      >
        <div className="flex w-max mx-auto items-center gap-2 px-4 py-3">
          {mediaList.map((m, idx) => (
            <button
              key={m.id}
              data-active={idx === activeIndex ? "true" : undefined}
              onClick={() => jumpTo(idx)}
              className={cn(
                "relative shrink-0 overflow-hidden rounded-lg transition-all",
                idx === activeIndex
                  ? "ring-2 ring-white opacity-100"
                  : "opacity-50 hover:opacity-80",
              )}
              style={{ width: 56, height: 56 }}
              aria-label={t("lightbox.jumpTo", { index: idx + 1 })}
            >
              {m.mediaType === "video" ? (
                <span className="flex h-full w-full items-center justify-center bg-black/30 text-white/70">
                  <Film size={16} />
                </span>
              ) : (
                <img
                  src={m.thumbnailUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              )}
              {m.isFavorite && (
                <span className="absolute right-0.5 top-0.5 text-rose-400">
                  <Heart size={10} className="fill-rose-400" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Counter */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/50 tabular-nums pointer-events-none">
        {t("lightbox.counter", {
          current: currentIndex + 1,
          total: mediaList.length,
        })}
      </div>
    </div>
  );
};

export default LightboxFilmstrip;
