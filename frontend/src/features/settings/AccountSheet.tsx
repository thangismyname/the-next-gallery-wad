import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { AccountPanel } from "./components/AccountPanel";

/** Drag down further than this (px) or flick → close, like the mobile sheet. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 600;

/**
 * Account sheet (web twin of the mobile `/account` form sheet): the avatar opens
 * a card that slides up from the bottom (centered, ≤ 42rem wide, 90 vh), with a
 * grabber — drag it down / Esc / click outside to close. Content = `AccountPanel`.
 * Following a link inside (Trash, Admin) closes it.
 */
export function AccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const { pathname } = useLocation();

  // A row navigated somewhere (Trash, Admin…) → get out of the way. Only when it was already open
  // before the path changed: /settings opens it and redirects in the same render, which must not close it.
  const prev = useRef({ open, pathname });
  useEffect(() => {
    if (prev.current.open && open && prev.current.pathname !== pathname) onOpenChange(false);
    prev.current = { open, pathname };
  }, [pathname, open, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-background shadow-2xl outline-none"
                initial={reduce ? { opacity: 0 } : { y: "100%" }}
                animate={reduce ? { opacity: 1 } : { y: 0 }}
                exit={reduce ? { opacity: 0 } : { y: "100%" }}
                transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.32 }}
                drag={reduce ? false : "y"}
                dragListener={false}
                dragControls={drag}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > CLOSE_DISTANCE || info.velocity.y > CLOSE_VELOCITY) onOpenChange(false);
                }}
              >
                {/* Grabber + title bar = the drag handle (the content keeps scrolling normally). */}
                <div
                  className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
                  onPointerDown={(e) => drag.start(e)}
                >
                  <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-foreground/20" />
                  <div className="flex items-center px-4 pt-2 pb-3">
                    <DialogPrimitive.Close
                      className="flex size-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/70"
                      aria-label={t("common.close")}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <X className="size-4" />
                    </DialogPrimitive.Close>
                    <DialogPrimitive.Title className="flex flex-1 items-center justify-center gap-2 pr-9">
                      <img src="/favicon.svg" alt="" className="size-5" />
                      <span className="font-mono text-xs tracking-[0.2em] uppercase">{t("app.name")}</span>
                    </DialogPrimitive.Title>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 sm:px-6">
                  <AccountPanel />
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
