// features/navigation/components/BottomBarNav.tsx
import React, { useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { isNavActive, useNavItems } from "@/features/navigation/useNavItems";
import { cn } from "@/lib/utils";

/** Same slot size as the mobile BottomBar (`BOTTOM_BAR_ITEM_W/H`, gap 2, padding 4). */
const ITEM_W = 58;
const ITEM_H = 46;
const GAP = 2;
const PAD = 4;
const STEP = ITEM_W + GAP;
/** Sideways drag (px) before the pill starts following the pointer. */
const DRAG_START = 8;

/**
 * Floating bottom bar — same as the mobile one (minus Liquid Glass: web keeps the
 * `glass` surface): **icons only** (the label is the aria-label / title), equal
 * slots, Camera like any other tab, one capsule sliding behind the active tab.
 * Drag along the bar: the capsule follows the pointer, icons light up as it
 * passes, release opens the tab under it. Pressing swells the bar slightly.
 */
export const BottomBarNav: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const items = useNavItems()
    .filter((item) => item.bottomBar !== undefined)
    .sort((a, b) => a.bottomBar! - b.bottomBar!);
  const activeIndex = items.findIndex((item) => isNavActive(item.to, pathname));
  const maxX = (items.length - 1) * STEP;

  // Drag state: x of the capsule while dragging (null = resting on the active tab).
  const [dragX, setDragX] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const drag = useRef<{ startX: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const posFor = (clientX: number, left: number) =>
    Math.min(Math.max(clientX - left - PAD - ITEM_W / 2, 0), maxX);
  const highlighted = dragX !== null ? Math.round(dragX / STEP) : activeIndex;
  const capsuleX = dragX ?? Math.max(activeIndex, 0) * STEP;

  return (
    <div
      role="tablist"
      className={cn(
        "glass relative flex touch-pan-y items-center rounded-full transition-transform duration-150 ease-out select-none",
        pressed && "scale-[1.03]",
      )}
      style={{ gap: GAP, padding: PAD }}
      onPointerDown={(e) => {
        setPressed(true);
        dragged.current = false;
        drag.current = { startX: e.clientX, left: e.currentTarget.getBoundingClientRect().left, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved) {
          if (Math.abs(e.clientX - d.startX) < DRAG_START) return;
          d.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setDragX(posFor(e.clientX, d.left));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setPressed(false);
        if (!d?.moved) return;
        const index = Math.round(posFor(e.clientX, d.left) / STEP);
        dragged.current = true; // the click that follows must not open the start tab
        setDragX(null);
        const item = items[index];
        if (item && index !== activeIndex) navigate(item.to);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPressed(false);
        setDragX(null);
      }}
    >
      {/* Capsule behind the active tab (follows the pointer while dragging). */}
      {activeIndex >= 0 || dragX !== null ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full bg-foreground/10",
            dragX === null && "transition-transform duration-[220ms] ease-out motion-reduce:transition-none",
          )}
          style={{
            left: PAD,
            top: PAD,
            width: ITEM_W,
            height: ITEM_H,
            transform: `translateX(${capsuleX}px) scale(${pressed ? 1.1 : 1})`,
          }}
        />
      ) : null}

      {items.map((item, index) => {
        const Icon = item.icon;
        const active = index === activeIndex;
        const lit = index === highlighted;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            title={item.label}
            draggable={false}
            onClick={(e) => {
              if (dragged.current) {
                e.preventDefault();
                dragged.current = false;
              }
            }}
            className="relative grid shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ width: ITEM_W, height: ITEM_H }}
          >
            <Icon
              className={cn(
                "size-[23px] transition-colors duration-150",
                lit ? "text-foreground" : "text-neutral-600 dark:text-muted-foreground",
              )}
            />
            {!!item.badge && !active && (
              <span className="absolute top-2 right-3 size-2.5 rounded-full border-2 border-background bg-primary" />
            )}
          </NavLink>
        );
      })}
    </div>
  );
};
