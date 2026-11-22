import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ImagePlus, RotateCcw, UserRound, ZoomIn } from "lucide-react";
import {
  DEFAULT_FRAMING,
  FRAMING_MAX_ZOOM,
  MOMENT_ASPECT,
  panFraming,
  resolveMediaUrl,
  zoomFraming,
  type FramerCell,
  type MomentFraming,
} from "@tng/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { framingStyle } from "../framing";

export type FramerPhoto = { id: string; src: string; mediaType: "photo" | "video" };

type Props = {
  /** Ảnh của mình — `layout` trỏ tới chúng bằng index. */
  photos: FramerPhoto[];
  /** Từng ô của card, trên → dưới (xem `FramerCell`). */
  layout: FramerCell[];
  framings: Record<string, MomentFraming>;
  onFrame: (id: string, framing: MomentFraming) => void;
  /** Ô `slot` nhận được ảnh của mình không (ô trống của mình / ô chưa giao cho ai). */
  canPlace: (slot: number) => boolean;
  /** Chuyển ảnh ở ô `from` sang ô `to` (ô đó có ảnh của mình thì đổi chỗ). */
  onMove: (from: number, to: number) => void;
};

const WIDTH = 240;

/**
 * Xem trước card moment với ảnh đã chọn: kéo ảnh = chọn phần hiện, chụm 2 ngón (màn cảm ứng /
 * trackpad) hoặc thanh trượt = zoom 1–3x, bấm ô trống = đặt ảnh đang chọn vào đó, ↑ / ↓ = sang ô
 * bên cạnh. Chưa lưu gì — bấm Đăng mới chốt. Cùng CSS với card (framing.ts).
 */
export function MomentFramer({ photos, layout, framings, onFrame, canPlace, onMove }: Props) {
  const { t } = useTranslation();
  const photoSlots = layout.flatMap((cell, slot) => (typeof cell === "number" && photos[cell] ? [slot] : []));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const current = activeSlot !== null && photoSlots.includes(activeSlot) ? activeSlot : (photoSlots[0] ?? null);
  const currentCell = current === null ? null : layout[current];
  const photo = typeof currentCell === "number" ? photos[currentCell] : undefined;
  const framing = (photo && framings[photo.id]) || DEFAULT_FRAMING;
  const multiSlot = layout.length > 1;

  const move = (to: number) => {
    if (current === null || to < 0 || to >= layout.length || !canPlace(to)) return;
    onMove(current, to);
    setActiveSlot(to);
  };

  if (!photo || current === null) return null;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div
        className="grid shrink-0 gap-0.5 overflow-hidden rounded-3xl bg-black"
        style={{ width: WIDTH, height: WIDTH * MOMENT_ASPECT, gridTemplateRows: `repeat(${layout.length}, 1fr)` }}
      >
        {layout.map((cell, slot) => {
          if (typeof cell === "number" && photos[cell]) {
            const p = photos[cell];
            return (
              <FrameSlot
                key={p.id}
                photo={p}
                framing={framings[p.id] ?? DEFAULT_FRAMING}
                active={multiSlot && slot === current}
                label={t("moments.framer.slot", { n: slot + 1 })}
                onSelect={() => setActiveSlot(slot)}
                onFrame={(f) => onFrame(p.id, f)}
              />
            );
          }
          if (cell && typeof cell === "object") {
            return (
              <div key={`other-${slot}`} className="relative min-h-0 overflow-hidden">
                <img
                  src={resolveMediaUrl(cell.src)}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-70"
                  style={framingStyle(cell.framing)}
                />
              </div>
            );
          }
          return canPlace(slot) ? (
            <button
              key={`free-${slot}`}
              type="button"
              onClick={() => move(slot)}
              className="grid min-h-0 place-items-center border border-dashed border-white/25 bg-muted/30 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              title={t("moments.framer.placeHere")}
            >
              <span className="flex flex-col items-center gap-0.5 text-[11px]">
                <UserRound className="size-3.5" />
                {t("moments.framer.friendSlot")}
                <span className="flex items-center gap-1 text-[10px] opacity-80">
                  <ImagePlus className="size-3" />
                  {t("moments.framer.placeHere")}
                </span>
              </span>
            </button>
          ) : (
            <div key={`friend-${slot}`} className="grid min-h-0 place-items-center bg-muted/30 text-muted-foreground">
              <span className="flex items-center gap-1 text-[11px]">
                <UserRound className="size-3.5" />
                {t("moments.framer.friendSlot")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-3 text-xs">
        <p className="text-muted-foreground">{t("moments.framer.hint")}</p>
        {multiSlot && <p className="font-medium">{t("moments.framer.editing", { n: current + 1 })}</p>}
        <label className="flex items-center gap-2">
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="range"
            min={1}
            max={FRAMING_MAX_ZOOM}
            step={0.05}
            value={framing.zoom}
            aria-label={t("moments.framer.zoom")}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
            onChange={(e) => onFrame(photo.id, zoomFraming(framing, Number(e.target.value)))}
          />
          <span className="w-9 text-right tabular-nums">{framing.zoom.toFixed(1)}×</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {multiSlot && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={!canPlace(current - 1)} onClick={() => move(current - 1)}>
                <ArrowUp data-icon="inline-start" />
                {t("moments.framer.moveUp")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!canPlace(current + 1)} onClick={() => move(current + 1)}>
                <ArrowDown data-icon="inline-start" />
                {t("moments.framer.moveDown")}
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => onFrame(photo.id, DEFAULT_FRAMING)}>
            <RotateCcw data-icon="inline-start" />
            {t("moments.framer.reset")}
          </Button>
        </div>
      </div>
    </div>
  );
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 1 ô: 1 ngón / chuột kéo = dời ảnh · 2 ngón chụm = zoom · trackpad chụm (wheel + ctrlKey) = zoom ·
 * phím mũi tên = dời, +/− = zoom.
 */
function FrameSlot({
  photo,
  framing,
  active,
  label,
  onSelect,
  onFrame,
}: {
  photo: FramerPhoto;
  framing: MomentFraming;
  active: boolean;
  label: string;
  onSelect: () => void;
  onFrame: (f: MomentFraming) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // Mốc của cử chỉ đang diễn ra: kéo (1 điểm) hoặc chụm (khoảng cách 2 điểm).
  const gesture = useRef<{ start: MomentFraming; x: number; y: number; dist: number } | null>(null);
  // Khung mới nhất cho handler gắn ngoài React (wheel) và lúc bắt đầu cử chỉ.
  const latest = useRef(framing);
  useEffect(() => {
    latest.current = framing;
  }, [framing]);

  const pan = (dx: number, dy: number, from: MomentFraming) => {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img?.naturalWidth || !box) return;
    onFrame(
      panFraming(from, dx, dy, {
        frameW: box.clientWidth,
        frameH: box.clientHeight,
        imgW: img.naturalWidth,
        imgH: img.naturalHeight,
      }),
    );
  };

  const restart = () => {
    const pts = [...pointers.current.values()];
    gesture.current = pts.length
      ? { start: latest.current, x: pts[0].x, y: pts[0].y, dist: pts.length > 1 ? distance(pts[0], pts[1]) : 0 }
      : null;
  };

  // Trackpad chụm = wheel + ctrlKey — cần listener không passive để chặn trình duyệt zoom cả trang.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      onFrame(zoomFraming(latest.current, latest.current.zoom * Math.exp(-e.deltaY / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onFrame]);

  const lift = (id: number) => {
    pointers.current.delete(id);
    restart(); // nhấc 1 ngón khi đang chụm → tiếp tục kéo từ vị trí mới, không nhảy
  };

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative min-h-0 cursor-grab touch-none overflow-hidden outline-none select-none active:cursor-grabbing",
        active && "ring-2 ring-primary ring-inset",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      onPointerDown={(e) => {
        onSelect();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        restart();
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        if (!g) return;
        const pts = [...pointers.current.values()];
        if (pts.length > 1 && g.dist > 0) {
          onFrame(zoomFraming(g.start, (g.start.zoom * distance(pts[0], pts[1])) / g.dist));
        } else if (pts.length === 1) {
          pan(pts[0].x - g.x, pts[0].y - g.y, g.start);
        }
      }}
      onPointerUp={(e) => lift(e.pointerId)}
      onPointerCancel={(e) => lift(e.pointerId)}
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=" || e.key === "-") {
          e.preventDefault();
          onFrame(zoomFraming(framing, framing.zoom + (e.key === "-" ? -0.1 : 0.1)));
          return;
        }
        const step = 10;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!delta) return;
        e.preventDefault();
        onSelect();
        pan(delta[0], delta[1], framing);
      }}
    >
      <img
        ref={imgRef}
        src={resolveMediaUrl(photo.src)}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full object-cover"
        style={framingStyle(framing)}
      />
    </div>
  );
}
