// DialogContent kéo được (mọi phần tử có `data-drag-handle`, thường là DialogHeader) + đổi cỡ ở góc
// dưới-phải, nháy đúp góc = về mặc định — giống Spotlight. Cỡ / vị trí lưu localStorage theo `storageKey`.
// Chiều cao hiện tại có trong CSS var `--panel-h` (vd lưới ảnh cao theo dialog).
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { GripHorizontal } from "lucide-react";

import { DialogContent } from "@/components/ui/dialog";
import { useDraggablePanel } from "@/hooks/useDraggablePanel";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { cn } from "@/lib/utils";

type Props = {
  storageKey: string;
  defaultWidth: number;
  defaultHeight: () => number;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof DialogContent>, "style" | "ref" | "className" | "children">;

export const ResizableDialogContent: React.FC<Props> = ({
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth = 360,
  minHeight = 420,
  className,
  children,
  ...rest
}) => {
  const { t } = useTranslation();
  const { size, shiftX, shiftY, isResizing, startResize, reset: resetSize } = useResizablePanel({
    storageKey: `${storageKey}Size`,
    defaultWidth,
    defaultHeight: defaultHeight(),
    minWidth,
    minHeight,
  });
  const { panelRef, pos, isDragging, startDrag, resetPos } = useDraggablePanel({ storageKey: `${storageKey}Pos` });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-drag-handle]")) return;
      if (target.closest("input, textarea, button, a, [data-no-drag]")) return;
      e.preventDefault();
      startDrag(e);
    },
    [startDrag],
  );

  return (
    <DialogContent
      {...rest}
      ref={panelRef}
      onPointerDown={onPointerDown}
      className={cn(
        "flex max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none [&_[data-drag-handle]]:cursor-move [&_[data-drag-handle]]:select-none",
        (isResizing || isDragging) && "select-none",
        className,
      )}
      style={
        {
          width: size.width,
          height: size.height,
          transform: `translate(${pos.x + shiftX}px, ${pos.y + shiftY}px)`,
          "--panel-h": `${size.height}px`,
        } as React.CSSProperties
      }
    >
      <GripHorizontal
        className="pointer-events-none absolute top-2 left-1/2 size-4 -translate-x-1/2 text-muted-foreground/40"
        aria-hidden
      />
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 bottom-1 hidden text-[10px] leading-none text-muted-foreground/50 select-none sm:block"
      >
        {t("search.resetHint")}
      </span>
      <button
        type="button"
        aria-label={t("search.resizeHandle")}
        title={t("search.resizeHandle")}
        onPointerDown={startResize}
        onDoubleClick={() => {
          resetSize();
          resetPos();
        }}
        className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize touch-none text-muted-foreground/50 transition-colors select-none hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" className="size-full" fill="none">
          <path d="M14 6 L6 14 M14 10 L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </DialogContent>
  );
};
