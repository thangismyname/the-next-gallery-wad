import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AVATAR_MAX_ZOOM,
  avatarCrop,
  avatarImagePath,
  avatarLayout,
  type MediaListItem,
} from "@tng/shared";

const VIEW = 288;

type Props = {
  /** Photo picked from the library; null = closed. */
  media: MediaListItem | null;
  onClose: () => void;
  /** Relative avatar path with the crop (`avatarImagePath`). */
  onDone: (imagePath: string) => void;
};

/**
 * Crop the picked photo to the avatar circle (same model as the mobile crop
 * screen — `avatarLayout` / `avatarCrop` in @tng/shared): drag to move, wheel /
 * slider / buttons to zoom. The photo always covers the circle.
 */
export const AvatarCropDialog: React.FC<Props> = ({
  media,
  onClose,
  onDone,
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={!!media} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("profile.avatarCropTitle")}</DialogTitle>
          <DialogDescription>{t("profile.avatarCropDesc")}</DialogDescription>
        </DialogHeader>
        {/* Remount per photo → zoom / pan start fresh. */}
        {media && (
          <Cropper
            key={media.id}
            media={media}
            onCancel={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

function Cropper({
  media,
  onCancel,
  onDone,
}: {
  media: MediaListItem;
  onCancel: () => void;
  onDone: (path: string) => void;
}) {
  const { t } = useTranslation();
  const src = media.displayUrl || media.thumbnailUrlLarge || media.url;
  const [size, setSize] = useState(
    media.width && media.height
      ? { width: media.width, height: media.height }
      : null,
  );
  const [zoom, setZoomRaw] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const layout = size ? avatarLayout(size, VIEW, zoom, pan.x, pan.y) : null;
  const setZoom = (next: number) => {
    const z = Math.min(AVATAR_MAX_ZOOM, Math.max(1, next));
    setZoomRaw(z);
    // Zooming out may leave a gap → pull the photo back so it still covers the circle.
    if (size) {
      const l = avatarLayout(size, VIEW, z, pan.x, pan.y);
      setPan({ x: l.tx, y: l.ty });
    }
  };

  return (
    <>
      <DialogBody className="space-y-4">
        <div
          className="relative mx-auto touch-none overflow-hidden rounded-2xl bg-black select-none"
          style={{
            width: VIEW,
            height: VIEW,
            cursor: drag.current ? "grabbing" : "grab",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }}
          onPointerMove={(e) => {
            if (!drag.current || !size) return;
            const l = avatarLayout(
              size,
              VIEW,
              zoom,
              drag.current.panX + e.clientX - drag.current.x,
              drag.current.panY + e.clientY - drag.current.y,
            );
            setPan({ x: l.tx, y: l.ty });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => setZoom(zoom * Math.exp(-e.deltaY * 0.002))}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) =>
              !size &&
              setSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
            style={
              layout
                ? {
                    width: layout.width,
                    height: layout.height,
                    transform: `translate(calc(-50% + ${layout.tx}px), calc(-50% + ${layout.ty}px))`,
                  }
                : { opacity: 0 }
            }
          />
          {/* Circle mask: everything outside it dimmed (the shadow is clipped to the square). */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
        </div>

        <div className="flex items-center gap-3 px-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom / 1.2)}
            aria-label={t("profile.zoomOut")}
          >
            <ZoomOut className="size-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={AVATAR_MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t("profile.zoom")}
            className="flex-1 accent-primary"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom * 1.2)}
            aria-label={t("profile.zoomIn")}
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!size}
          onClick={() =>
            size &&
            onDone(
              avatarImagePath(
                media.id,
                avatarCrop(size, VIEW, zoom, pan.x, pan.y),
              ),
            )
          }
        >
          {t("profile.avatarUse")}
        </Button>
      </DialogFooter>
    </>
  );
}
