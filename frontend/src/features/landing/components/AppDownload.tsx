import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Camera,
  CloudUpload,
  Clock3,
  FolderOpen,
  Image as ImageIcon,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { IconBrandApple, IconBrandGooglePlay } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { AI_CHIP } from "@/lib/aiColors";
import { useLandingCta } from "../useLandingCta";
import { floatLoop } from "../landing.motion";
import { usePointerTilt } from "@/hooks/usePointerTilt";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import image1 from "@/assets/images/image_1.jpg";
import image2 from "@/assets/images/image_2.jpg";
import image3 from "@/assets/images/image_3.jpg";
import image4 from "@/assets/images/image_4.jpg";
import image5 from "@/assets/images/image_5.jpg";

const FEATURES = [
  { key: "backup", icon: CloudUpload },
  { key: "search", icon: Search },
  { key: "moments", icon: Clock3 },
  { key: "send", icon: Send },
] as const;

const STORES = [
  { key: "appStore", icon: IconBrandApple },
  { key: "googlePlay", icon: IconBrandGooglePlay },
] as const;

// Ô ảnh trong màn hình điện thoại mẫu (lặp 5 ảnh minh hoạ của landing).
const MOCK_PHOTOS = [image3, image1, image2, image5, image4, image3, image2, image4, image1];

/**
 * Section "Ứng dụng di động — sắp ra mắt": lợi ích bản mobile, nút App Store /
 * Google Play (chưa có link → hiện "Sắp ra mắt"), QR mở web trên điện thoại,
 * và mockup điện thoại dựng bằng CSS (không cần ảnh chụp màn hình).
 */
export function AppDownload() {
  const { t } = useTranslation();
  const { go } = useLandingCta();
  const reduce = useReducedMotion();
  const webUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Nghiêng 3D theo chuột (hooks/usePointerTilt).
  const tilt = usePointerTilt();


  return (
    <section id="download" className="scroll-mt-20 overflow-hidden border-t border-border/60">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
        {/* Trái: nội dung */}
        <div>
          <Reveal>
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t("download.eyebrow")}
            </h3>
            <p className="mt-4 max-w-lg font-heading text-3xl leading-tight md:text-5xl">
              {t("download.title")}
            </p>
            <p className="mt-4 max-w-md font-sans text-sm text-muted-foreground">
              {t("download.subtitle")}
            </p>
          </Reveal>

          <RevealGroup as="ul" stagger={0.08} className="mt-8 max-w-md border-t border-border/60">
            {FEATURES.map(({ key, icon: Icon }) => (
              <RevealItem
                as="li"
                key={key}
                className="flex items-center gap-3 border-b border-border/60 py-3 text-sm"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {t(`download.features.${key}`)}
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal delay={0.15} className="mt-8 flex flex-wrap items-center gap-3">
            {STORES.map(({ key, icon: Icon }) => (
              // Chưa phát hành → không phải link; khi có app chỉ cần đổi thành <a href=…>.
              <div
                key={key}
                aria-disabled="true"
                className="relative flex h-14 min-w-44 items-center gap-3 border border-border bg-foreground px-4 text-background transition-transform duration-300 hover:-translate-y-0.5"
              >
                <Icon className="size-7 shrink-0" stroke={1.5} />
                <div className="leading-tight">
                  <p className="font-mono text-[9px] uppercase tracking-widest opacity-70">
                    {t("download.comingOn")}
                  </p>
                  <p className="text-base font-semibold">{t(`download.${key}`)}</p>
                </div>
                <span className="absolute -top-2 right-2 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-foreground ring-1 ring-border">
                  {t("download.soon")}
                </span>
              </div>
            ))}
          </Reveal>

          <Reveal delay={0.25} className="mt-6">
            <button
              type="button"
              onClick={go}
              className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("download.web")}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </Reveal>
        </div>

        {/* Phải: mockup điện thoại + QR (QR chỉ trên màn lớn — đang ở điện thoại thì không cần quét) */}
        <Reveal y={60} delay={0.1} className="relative mx-auto w-[250px] sm:w-[280px]">
          <div className="[perspective:1200px]" {...tilt.handlers}>
            <motion.div style={tilt.style} {...floatLoop(reduce)}>
              <PhoneMockup photos={MOCK_PHOTOS} title={t("download.mockTitle")} today={t("download.mockToday")} />
            </motion.div>
          </div>

          {webUrl && (
            <div className="glass absolute top-1/2 -left-28 hidden w-36 -translate-y-1/2 rounded-xl p-3 text-center lg:block">
              <div className="mx-auto w-fit rounded-md bg-white p-1.5">
                <QRCodeSVG value={webUrl} size={96} />
              </div>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {t("download.qr")}
              </p>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/** Điện thoại dựng bằng CSS: khung + tai thỏ + màn Thư viện + bottom bar của app. */
function PhoneMockup({
  photos,
  title,
  today,
}: {
  photos: string[];
  title: string;
  today: string;
}) {
  return (
    <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.6rem] border-[10px] border-neutral-900 bg-background shadow-2xl shadow-black/25 dark:border-neutral-700">
      <div className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-neutral-900 dark:bg-neutral-700" />

      <div className="px-3 pt-10">
        <p className="text-center font-mono text-[7px] uppercase tracking-[0.2em] text-muted-foreground">
          The Next Gallery
        </p>
        <p className="mt-3 font-heading text-xl font-semibold">{title}</p>
        <p className="mt-2 mb-1.5 font-mono text-[7px] uppercase tracking-widest text-muted-foreground">
          {today}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-[3px] bg-muted">
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
              {i === 0 && (
                <span
                  className={cn(
                    "absolute bottom-1 left-1 rounded-full px-1 py-px text-[6px] font-medium",
                    AI_CHIP.yolo,
                  )}
                >
                  person
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar thu nhỏ — giống BottomBarNav của app */}
      <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-0.5">
        <span className="flex h-6 items-center gap-1 rounded-full bg-primary px-2 text-[8px] font-medium text-primary-foreground">
          <ImageIcon className="size-2.5" />
          {title}
        </span>
        <FolderOpen className="mx-1.5 size-2.5 text-muted-foreground" />
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
          <Camera className="size-3" />
        </span>
        <Clock3 className="mx-1.5 size-2.5 text-muted-foreground" />
        <Sparkles className="mx-1.5 size-2.5 text-muted-foreground" />
      </div>
    </div>
  );
}
