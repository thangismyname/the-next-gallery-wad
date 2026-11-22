import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { VIDEO_SPEEDS, clampVolume, formatDuration } from "@tng/shared";
import { cn } from "@/lib/utils";

const PREFS_KEY = "tng.videoPrefs";

function readPrefs(): { volume: number; muted: boolean; rate: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      volume: typeof p.volume === "number" ? clampVolume(p.volume) : 1,
      muted: p.muted === true,
      rate: VIDEO_SPEEDS.includes(p.rate) ? p.rate : 1,
    };
  } catch {
    return { volume: 1, muted: false, rate: 1 };
  }
}

/**
 * Video của Lightbox với điều khiển riêng NẰM TRONG khung video (thay điều khiển gốc của trình
 * duyệt → chỉ 1 nút âm lượng): phát / dừng · tua · thời gian · tốc độ 0.5× · 1× · 2× · tắt tiếng +
 * âm lượng · toàn màn hình. Tự ẩn sau 2.5 s khi đang phát, hiện lại khi rê chuột / chạm. Nhớ âm
 * lượng + tốc độ (localStorage `tng.videoPrefs`) cho video sau.
 */
export function LightboxVideo({ src, poster }: { src: string; poster?: string }) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shown, setShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Âm lượng / tốc độ đã nhớ áp vào video khi mở.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const initial = readPrefs();
    video.volume = initial.volume;
    video.muted = initial.muted;
    video.playbackRate = initial.rate;
    video.defaultPlaybackRate = initial.rate;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage bị chặn — chỉ không nhớ được
    }
  }, [prefs]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  /** Hiện thanh điều khiển, tự ẩn sau 2.5 s nếu video đang phát. */
  const poke = () => {
    setShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShown(false);
    }, 2500);
  };

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
    poke();
  };

  const set = (patch: { volume?: number; muted?: boolean; rate?: number }) => {
    const video = videoRef.current;
    if (!video) return;
    if (patch.volume !== undefined) video.volume = clampVolume(patch.volume);
    if (patch.muted !== undefined) video.muted = patch.muted;
    if (patch.rate !== undefined) {
      video.playbackRate = patch.rate;
      video.defaultPlaybackRate = patch.rate; // đổi src → trình duyệt trả về tốc độ mặc định này
    }
    poke();
  };

  const silent = prefs.muted || prefs.volume === 0;
  const VolumeIcon = silent ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2;
  const barShown = shown || !playing;

  return (
    <div
      ref={boxRef}
      // Phủ đúng vùng xem (kích thước xác định) → video `object-contain` vừa khung cả clip dọc. Trước
      // đây khung chỉ có max-h → `max-h-full` của <video> không có gì để tính, clip dọc bị cắt.
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      onMouseMove={poke}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={src}
        // Poster hiện ngay; trình duyệt chỉ tải đoạn đầu (Range) để phát.
        poster={poster}
        preload="metadata"
        autoPlay
        playsInline
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          setShown(true);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          const { volume, muted } = e.currentTarget;
          setPrefs((p) => ({ ...p, volume: clampVolume(volume), muted }));
        }}
        onRateChange={(e) => {
          const rate = e.currentTarget.playbackRate;
          setPrefs((p) => ({ ...p, rate }));
        }}
        className="h-full w-full cursor-pointer object-contain"
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-3 pt-10 pb-2.5 text-white transition-opacity duration-200",
          barShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          aria-label={t("lightbox.player.seek")}
          onChange={(e) => {
            if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
            poke();
          }}
          className="h-1 w-full cursor-pointer accent-white"
        />
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={toggle}
            aria-label={t(playing ? "lightbox.player.pause" : "lightbox.player.play")}
            className="grid size-7 place-items-center rounded-full hover:bg-white/15"
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <span className="tabular-nums opacity-90">
            {formatDuration(time)} / {formatDuration(duration)}
          </span>

          <div role="radiogroup" aria-label={t("lightbox.player.speed")} className="ml-auto flex gap-0.5">
            {VIDEO_SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                role="radio"
                aria-checked={prefs.rate === rate}
                onClick={() => set({ rate })}
                className={cn(
                  "rounded-full px-2 py-0.5 tabular-nums transition-colors",
                  prefs.rate === rate ? "bg-white text-black" : "text-white/80 hover:text-white",
                )}
              >
                {rate}×
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              // Bật lại tiếng ở âm lượng cũ (đang 0 thì 50 %).
              onClick={() => (silent ? set({ muted: false, volume: prefs.volume || 0.5 }) : set({ muted: true }))}
              aria-label={t(silent ? "lightbox.player.unmute" : "lightbox.player.mute")}
              title={t(silent ? "lightbox.player.unmute" : "lightbox.player.mute")}
              className="grid size-7 place-items-center rounded-full hover:bg-white/15"
            >
              <VolumeIcon className="size-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.muted ? 0 : prefs.volume}
              aria-label={t("lightbox.player.volume")}
              onChange={(e) => {
                const volume = Number(e.target.value);
                set({ volume, muted: volume === 0 });
              }}
              className="h-1 w-20 cursor-pointer accent-white"
            />
          </div>

          <button
            type="button"
            onClick={() => void boxRef.current?.requestFullscreen?.()}
            aria-label={t("lightbox.player.fullscreen")}
            title={t("lightbox.player.fullscreen")}
            className="grid size-7 place-items-center rounded-full hover:bg-white/15"
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
