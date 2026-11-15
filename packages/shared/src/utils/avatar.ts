/**
 * Avatar from a library photo + crop — shared by web and mobile so both build
 * the same `user.image`. Path is RELATIVE (`/api/profile/avatar/<id>?c=x,y,w,h`)
 * so it works on every host (web, LAN IP of the phone, prod); clients resolve it
 * with `resolveMediaUrl`. The backend reads the crop from the stored URL
 * (`backend/src/modules/profile/profile.avatar.js`) — keep the format in sync.
 */

/** Visible part of the photo, normalized 0–1 (x, y = top-left). */
export interface AvatarCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Max zoom of the crop editor (1 = the photo just covers the circle). */
export const AVATAR_MAX_ZOOM = 4;

const round = (n: number) => Math.round(n * 10000) / 10000;

export function avatarImagePath(mediaId: string, crop?: AvatarCrop | null): string {
  const path = `/api/profile/avatar/${mediaId}`;
  if (!crop) return path;
  return `${path}?c=${[crop.x, crop.y, crop.w, crop.h].map(round).join(",")}`;
}

/**
 * Crop editor model (same on both platforms): a square viewport of `view` px,
 * the photo drawn "cover" × `zoom`, its center moved by (`tx`, `ty`) px.
 * Returns the displayed size + the pan clamped so the photo always covers the viewport.
 */
export function avatarLayout(
  image: { width: number; height: number },
  view: number,
  zoom: number,
  tx: number,
  ty: number,
) {
  const base = view / Math.min(image.width, image.height);
  const scale = base * Math.min(Math.max(zoom, 1), AVATAR_MAX_ZOOM);
  const width = image.width * scale;
  const height = image.height * scale;
  const maxX = (width - view) / 2;
  const maxY = (height - view) / 2;
  return {
    width,
    height,
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  };
}

/** What the viewport shows, as a normalized crop of the photo. */
export function avatarCrop(
  image: { width: number; height: number },
  view: number,
  zoom: number,
  tx: number,
  ty: number,
): AvatarCrop {
  const l = avatarLayout(image, view, zoom, tx, ty);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const w = clamp(view / l.width);
  const h = clamp(view / l.height);
  return {
    x: Math.min(1 - w, clamp((l.width / 2 - l.tx - view / 2) / l.width)),
    y: Math.min(1 - h, clamp((l.height / 2 - l.ty - view / 2) / l.height)),
    w,
    h,
  };
}
