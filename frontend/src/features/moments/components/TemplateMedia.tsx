import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageOff, Pause, Play } from "lucide-react";
import { Moment, MomentSlot } from "@tng/shared";
import { cn } from "@/lib/utils";
import { getInitials } from "@tng/shared";
import { resolveMediaUrl } from "@tng/shared";

type TemplateMediaProps = {
  moment: Moment;
  t: ReturnType<typeof useTranslation>["t"];
  onImageClick: () => void;
  /** Card đang lật sang mặt meme → dừng video (không phát sau lưng). */
  paused?: boolean;
};

/** Badge thời lượng video (góc trên trái khung). */
function DurationBadge({ seconds }: { seconds?: number | null }) {
  if (!seconds || seconds <= 0) return null;
  const label = `${Math.max(1, Math.round(seconds))}s`;
  return (
    <span className="pointer-events-none absolute right-13 top-4 z-5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
      <Play className="size-2.5 fill-current" />
      {label}
    </span>
  );
}

/** Ảnh tĩnh của 1 khung — lỗi tải thì ẩn đi (nền card lộ ra). */
function FrameImage({
  src,
  displaySrc,
  alt,
}: {
  src: string;
  displaySrc?: string | null;
  alt: string;
}) {
  if (!src) return null;
  return (
    <img
      src={src}
      srcSet={displaySrc ? `${src} 400w, ${displaySrc} 1600w` : undefined}
      sizes="(min-width: 768px) 400px, 90vw"
      alt={alt}
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

/**
 * Video của 1 khung (P2.11):
 * - CHỈ phát khi khung nằm trong vùng nhìn (IntersectionObserver 50%) và card
 *   không bị lật → nhiều video trong feed không cùng phát/lải băng thông.
 * - `preload="none"` — chỉ tải khi thực sự cần; poster là thumbnail WebP.
 * - Nút play/pause riêng (không lồng trong nút mở card → HTML hợp lệ).
 */
function FrameVideo({
  src,
  poster,
  paused,
  label,
  onOpen,
  children,
}: {
  src: string;
  poster?: string;
  paused?: boolean;
  label: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (inView && !paused && !userPaused) {
      void el.play().catch(() => {
        // Autoplay bị chặn / giải mã lỗi → giữ poster, người dùng bấm play.
        setUserPaused(true);
      });
    } else {
      el.pause();
    }
  }, [inView, paused, userPaused]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        playsInline
        loop
        preload="none"
        className="size-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      {/* Vùng bấm mở card (double-tap → tim / 1 tap → lật) */}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 z-10"
        aria-label={label}
        aria-expanded={paused}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setUserPaused((prev) => !prev);
        }}
        className="absolute top-3 right-3 z-20 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75"
        aria-label={label}
      >
        {playing ? (
          <Pause className="size-3 fill-current" />
        ) : (
          <Play className="size-3 fill-current" />
        )}
      </button>
      {children}
    </div>
  );
}

/** Ảnh / video của 1 khung + vùng bấm mở card. */
function FrameMedia({
  src,
  displaySrc,
  poster,
  isVideo,
  alt,
  paused,
  label,
  onOpen,
  children,
}: {
  src: string;
  displaySrc?: string | null;
  poster?: string;
  isVideo: boolean;
  alt: string;
  paused?: boolean;
  label: string;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  if (isVideo) {
    return (
      <FrameVideo
        src={src}
        poster={poster}
        paused={paused}
        label={label}
        onOpen={onOpen}
      >
        {children}
      </FrameVideo>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <FrameImage src={src} displaySrc={displaySrc} alt={alt} />
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 z-10"
        aria-label={label}
        aria-expanded={paused}
      />
      {children}
    </div>
  );
}

/**
 * Người đăng của 1 khung (duo/trio): avatar ở GIỮA CẠNH TRÁI khung — không bao giờ
 * nằm ở góc bo của thẻ (bị lẹm) và thẳng hàng giữa các khung.
 */
function SlotBadge({ slot }: { slot: MomentSlot }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-3 z-5 grid size-8 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-black/55 ring-2 ring-white/90">
      {slot.userAvatarUrl ? (
        <img
          src={resolveMediaUrl(slot.userAvatarUrl)}
          alt=""
          className="size-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="text-[11px] font-semibold leading-none text-white">
          {getInitials(slot.userName)}
        </span>
      )}
    </span>
  );
}

/** Placeholder khi ảnh gốc đã bị xoá vĩnh viễn (P2.6). */
function MissingMedia({ label }: { label: string }) {
  return (
    <span className="absolute inset-0 grid grid-rows-[auto_auto] place-content-center place-items-center gap-1 bg-muted px-2 text-center text-[11px] text-muted-foreground">
      <ImageOff className="size-4 opacity-60" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Khối ảnh theo template của card moment:
 * - single: 1 ảnh/video full-bleed.
 * - duo_square: 2 ảnh chồng DỌC (mỗi ô ½ chiều cao), cách nhau vạch 2px.
 * - trio_wide: 3 ảnh chồng DỌC (mỗi ô ⅓ chiều cao), cách nhau vạch 2px.
 * Mỗi frame có vùng bấm riêng (nút phủ trong suốt, KHÔNG lồng nút vào nút).
 */
export function TemplateMedia({ moment, t, onImageClick, paused }: TemplateMediaProps) {
  const isMulti = moment.template !== "single";

  if (!isMulti) {
    const isVideo = moment.mediaType === "video";
    const label = t("moments.flipToMeme", { name: moment.userName });

    // Ảnh gốc đã bị xoá vĩnh viễn → không có gì để mở.
    if (moment.missingMedia) {
      return (
        <div className="absolute inset-0">
          <MissingMedia label={t("moments.mediaDeleted")} />
        </div>
      );
    }

    return (
      <div className="absolute inset-0">
        <FrameMedia
          src={
            isVideo
              ? (moment.url ?? moment.thumbnailUrl ?? "")
              : (moment.thumbnailUrl ?? "")
          }
          displaySrc={!isVideo ? moment.displayUrl : null}
          poster={moment.thumbnailUrl ?? undefined}
          isVideo={isVideo}
          alt={moment.caption ?? moment.userName}
          paused={paused}
          label={label}
          onOpen={onImageClick}
        >
          {isVideo && <DurationBadge seconds={moment.durationSeconds} />}
        </FrameMedia>
      </div>
    );
  }

  // Slot đã từng điền (ảnh còn hoặc đã xoá) — giữ đúng số ô của template.
  const visibleSlots = moment.slots.filter((s) => s.filled || s.missing);

  if (visibleSlots.length === 0) {
    return (
      <span className="absolute inset-0 grid h-full w-full place-items-center bg-muted text-xs text-muted-foreground">
        {t("moments.noPhoto")}
      </span>
    );
  }

  const gridClass =
    moment.template === "duo_square"
      ? "grid-cols-1 grid-rows-2"
      : "grid-cols-1 grid-rows-3";

  return (
    <div
      className={cn("absolute inset-0 grid h-full w-full gap-0.5 bg-black", gridClass)}
    >
      {visibleSlots.map((cell) => {
        if (cell.missing) {
          return (
            <div key={cell.slotIndex} className="relative min-h-0 min-w-0">
              <MissingMedia label={t("moments.mediaDeleted")} />
              <SlotBadge slot={cell} />
            </div>
          );
        }

        const isVideo = cell.mediaType === "video";
        const label = t("moments.flipToMeme", { name: cell.userName });

        return (
          <div
            key={cell.slotIndex}
            className="relative min-h-0 min-w-0 overflow-hidden"
            title={cell.userName}
          >
            <FrameMedia
              src={
                isVideo
                  ? (cell.url ?? cell.thumbnailUrl ?? "")
                  : (cell.thumbnailUrl ?? "")
              }
              poster={cell.thumbnailUrl ?? undefined}
              isVideo={isVideo}
              alt={cell.userName}
              paused={paused}
              label={label}
              onOpen={onImageClick}
            >
              {isVideo && <DurationBadge seconds={cell.durationSeconds} />}
              <SlotBadge slot={cell} />
            </FrameMedia>
          </div>
        );
      })}
    </div>
  );
}
