import { Image } from "expo-image";
import { Images, ScanSearch, Search, Send, Sparkles, Tags, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { GalleryWall } from "@/components/shared/GalleryWall";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AI_CHIP } from "@/lib/aiColors";
import { APP_DURATION, EASE_OUT, riseIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { CAPABILITIES, MARQUEE, SHOTS, STATS, STEPS, type Shot } from "../landingData";
import { useSlideParallax, useTypewriter } from "../useSlideMotion";
import { Marquee } from "./Marquee";
import { Eyebrow, SlideBody } from "./Slide";

/** Mọi slide nhận vị trí vuốt (chuyển trang) + `visited` (đã được xem → chạy hiệu ứng 1 lần). */
export type SlideProps = { scrollX: SharedValue<number>; index: number; width: number; visited: boolean };

/** Lớp trễ nhẹ theo ngón tay — hình trễ nhiều hơn chữ → có chiều sâu (useSlideParallax). */
function Layer({
  depth,
  className,
  style: extra,
  children,
  ...p
}: SlideProps & { depth: number; className?: string; style?: object; children?: React.ReactNode }) {
  const style = useSlideParallax(p.scrollX, p.index, p.width, depth);
  return (
    <Animated.View className={className} style={[extra, style]}>
      {children}
    </Animated.View>
  );
}

/** Kích thước thật của 1 ô (onLayout) — để hình tự co cho vừa phần trên của slide. */
function useBoxSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  return [size, onLayout] as const;
}

/** "Cửa sổ" bo góc nhìn vào bức tường gallery có chip AI — chữ ký hình ảnh của app (như nền màn đăng nhập). */
function WallWindow({ children }: { children?: React.ReactNode }) {
  const [box, onLayout] = useBoxSize();
  return (
    <View onLayout={onLayout} className="flex-1 overflow-hidden rounded-[32px] border border-border/60 bg-background">
      {box.width ? <GalleryWall width={box.width} scrim={false} /> : null}
      {children}
    </View>
  );
}

// ── 1. Hero — nền = bức tường gallery toàn màn (HeroBackdrop trong WelcomeScreen, như màn đăng nhập) ──
export function HeroSlide(p: SlideProps) {
  const { t } = useTranslation();
  const line1 = t("hero.titleLine1").split(" ");
  const line2 = t("hero.titleLine2").split(" ");
  // Tiêu đề hiện TỪNG TỪ (dòng 2 nối tiếp dòng 1) — như Hero web.
  const words = (line: string[], offset: number) => (
    <View className="flex-row flex-wrap">
      {line.map((word, i) => (
        <Animated.View key={`${word}-${i}`} entering={riseIn.delay(80 + (offset + i) * 45)}>
          <Text className="font-heading text-5xl leading-[1.15]">
            {word}
            {i < line.length - 1 ? " " : ""}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
  const after = 120 + (line1.length + line2.length) * 45;
  return (
    <SlideBody
      visual={
        // Để trống cho bức tường gallery (nền trang đầu) lộ ra.
        <View className="flex-1" />
      }
    >
      {/* Thẻ chữ đặc trên nền tường (không dùng glass: slide có hiệu ứng mờ khi vuốt) */}
      <Layer {...p} depth={0.04} className="gap-3 rounded-[28px] border border-border/60 bg-background/90 p-5">
        <Animated.View entering={riseIn}>
          <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
        </Animated.View>
        <View accessibilityRole="header" accessibilityLabel={`${t("hero.titleLine1")} ${t("hero.titleLine2")}`}>
          {words(line1, 0)}
          {words(line2, line1.length)}
        </View>
        <Animated.View entering={riseIn.delay(after)} className="gap-3">
          <Text className="text-[15px] leading-6 text-muted-foreground">{t("hero.subcopy")}</Text>
          <Text className="text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">{t("hero.stack")}</Text>
        </Animated.View>
        {/* Băng chữ chạy (công nghệ / tính năng) gộp vào cuối thẻ, tràn sát 2 mép thẻ */}
        <Animated.View entering={riseIn.delay(after + 150)} className="-mx-5 -mb-5 mt-1 overflow-hidden rounded-b-[28px]">
          <Marquee items={MARQUEE} />
        </Animated.View>
      </Layer>
    </SlideBody>
  );
}

// ── 2. AI showcase: khung YOLO + tag + câu tìm kiếm mẫu ───────────────────
function Photo({ shot, visited, delay, width }: { shot: Shot; visited: boolean; delay: number; width: number }) {
  const { t } = useTranslation();
  return (
    <View className="overflow-hidden rounded-2xl border border-border/60 bg-muted" style={{ width, aspectRatio: shot.aspect }}>
      <Image
        source={shot.source}
        contentFit="cover"
        contentPosition={shot.focusY !== undefined ? { left: "50%", top: `${shot.focusY * 100}%` } : "center"}
        transition={APP_DURATION.base}
        style={{ position: "absolute", inset: 0 }}
      />
      {/* Ảnh tới → khung YOLO "vẽ" vào → nhãn tag bật ra (1 lần, khi slide được xem). */}
      {visited
        ? shot.boxes.map((box, i) => (
            <Animated.View
              key={i}
              entering={FadeIn.delay(delay + 180 + i * 90).duration(APP_DURATION.slow)}
              className="absolute rounded-md border-2 border-emerald-400/90"
              style={{
                left: `${box.x1 * 100}%`,
                top: `${box.y1 * 100}%`,
                width: `${(box.x2 - box.x1) * 100}%`,
                height: `${(box.y2 - box.y1) * 100}%`,
              }}
            >
              <View className="absolute -top-[18px] -left-0.5 rounded-t-md bg-emerald-400 px-1.5 py-0.5">
                <Text className="text-[10px] font-semibold text-black">
                  {box.label} {box.conf}%
                </Text>
              </View>
            </Animated.View>
          ))
        : null}
      {visited ? (
        <Animated.View
          entering={riseIn.delay(delay + 360)}
          className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-black/65 px-2 py-1"
        >
          <Icon as={Sparkles} size={12} className="text-white" />
          <Text className="text-[11px] font-medium text-white">
            {t(`studio.tags.${shot.tag.key}`)} · {shot.tag.conf}%
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const GAP = 10;
/** Ô tìm kiếm đè lên mép dưới cụm ảnh bấy nhiêu pt. */
const SEARCH_OVERLAP = 40;
/** Bề ngang 2 cột của cụm ảnh (trái: ảnh phố; phải: chân dung + xe), tỉ lệ 1.15 : 1. */
const columns = (W: number) => [((W - GAP) * 1.15) / 2.15, (W - GAP) / 2.15] as const;
function collageHeight(W: number) {
  const [street, portrait, car] = SHOTS;
  const [left, right] = columns(W);
  return Math.max(left / street.aspect, right / portrait.aspect + right / car.aspect + GAP);
}
/** Bề ngang lớn nhất để cụm ảnh vừa chiều cao còn lại (chiều cao tăng đều theo bề ngang → tìm nhị phân). */
function fitCollage(box: { width: number; height: number }) {
  if (!box.width) return 0;
  const room = Math.max(160, box.height - SEARCH_OVERLAP - 24);
  let lo = 120;
  let hi = box.width;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (collageHeight(mid) <= room) lo = mid;
    else hi = mid;
  }
  return Math.min(box.width, lo);
}

export function ShowcaseSlide(p: SlideProps) {
  const { t } = useTranslation();
  const [street, portrait, car] = SHOTS;
  const [box, onLayout] = useBoxSize();
  const W = fitCollage(box);
  const [left, right] = columns(W);
  const { typed, done } = useTypewriter(t("preview.query"), p.visited);
  const chips = [
    { cls: AI_CHIP.yolo, text: "YOLO · person ×2" },
    { cls: AI_CHIP.tag, text: `Tag · ${t("studio.tags.street")}` },
    { cls: AI_CHIP.clip, text: "CLIP · 94%" },
  ];
  return (
    <SlideBody
      visual={
        <View onLayout={onLayout} className="flex-1 items-center justify-center">
          {W ? (
            <View style={{ width: W }}>
              <Layer {...p} depth={0.14}>
                <View className="flex-row" style={{ gap: GAP }}>
                  <Photo shot={street} visited={p.visited} delay={0} width={left} />
                  <View style={{ gap: GAP }}>
                    <Photo shot={portrait} visited={p.visited} delay={80} width={right} />
                    <Photo shot={car} visited={p.visited} delay={160} width={right} />
                  </View>
                </View>
              </Layer>
              {/* Ô tìm kiếm mẫu nổi đè mép dưới cụm ảnh: gõ dần câu → chip phân tích câu lần lượt hiện */}
              <Layer
                {...p}
                depth={0.08}
                className="mx-3 gap-2.5 rounded-2xl border border-border/60 bg-card p-3 shadow-lg shadow-black/15"
                style={{ marginTop: -SEARCH_OVERLAP }}
              >
                <View className="flex-row items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
                  <Icon as={Search} size={16} className="text-muted-foreground" />
                  <Text className="flex-1 text-sm" numberOfLines={1}>
                    {typed}
                    {!done ? <Text className="text-muted-foreground">|</Text> : null}
                    {typed.length === 0 ? " " : ""}
                  </Text>
                </View>
                <View className="min-h-6 flex-row flex-wrap gap-1.5">
                  {done
                    ? chips.map((chip, i) => (
                        <Animated.View key={chip.text} entering={riseIn.delay(i * 80)} className={cn("rounded-full px-2 py-0.5", chip.cls.box)}>
                          <Text className={cn("text-[11px] font-medium", chip.cls.text)}>{chip.text}</Text>
                        </Animated.View>
                      ))
                    : null}
                </View>
              </Layer>
            </View>
          ) : null}
        </View>
      }
    >
      <Layer {...p} depth={0.04} className="gap-2">
        <Text role="heading" className="font-heading text-3xl leading-tight">
          {t("capabilities.semanticSearch")}
        </Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">{t("capabilities.desc.semanticSearch")}</Text>
      </Layer>
    </SlideBody>
  );
}

// ── 3. Pipeline + số liệu ─────────────────────────────────────────────────
function StatValue({ value, active, className }: { value: string; active: boolean; className?: string }) {
  // Giữ chỗ (ẩn) tới khi slide được xem → số trượt lên (nhánh khác loại view → mount mới → entering chạy).
  const text = <Text className={cn("font-heading text-6xl", className)}>{value}</Text>;
  return active ? <Animated.View entering={riseIn.delay(120)}>{text}</Animated.View> : <View className="opacity-0">{text}</View>;
}

export function PipelineSlide(p: SlideProps) {
  const { t } = useTranslation();
  return (
    <SlideBody
      visual={
        <Layer {...p} depth={0.12} className="flex-row flex-wrap justify-between gap-y-3">
          {STATS.map(({ value, key }, i) => {
            // 1 ô tô đậm (17 tag — trọng tâm của đề tài) để lưới không đều đều.
            const strong = key === "tags";
            return (
              <View
                key={key}
                className={cn("justify-between rounded-[28px] p-4", strong ? "bg-foreground" : "bg-muted")}
                style={{ width: "48.5%", aspectRatio: i % 3 === 0 ? 1.15 : 1 }}
              >
                <Text className={cn("text-[10px] font-medium uppercase tracking-[2px]", strong ? "text-background/70" : "text-muted-foreground")}>
                  {t(`capabilities.stats.${key}`)}
                </Text>
                <StatValue value={value} active={p.visited} className={strong ? "text-background" : undefined} />
              </View>
            );
          })}
        </Layer>
      }
    >
      <Layer {...p} depth={0.04} className="gap-3">
        <Eyebrow>{t("capabilities.pipelineTitle")}</Eyebrow>
        <Text role="heading" className="font-heading text-3xl leading-tight">
          {t("capabilities.pipelineHeadline")}
        </Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">{t("capabilities.pipelineBody")}</Text>
      </Layer>
    </SlideBody>
  );
}

// ── 4. 6 tính năng — danh sách nhóm bo góc (inset grouped list kiểu Settings) ──
const CAPABILITY_ICONS: Record<(typeof CAPABILITIES)[number]["key"], LucideIcon> = {
  semanticSearch: Search,
  objectDetection: ScanSearch,
  visualSimilarity: Images,
  autoClassification: Tags,
  smartAlbums: Sparkles,
  sharing: Send,
};

export function CapabilitiesSlide(p: SlideProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 justify-center">
      <Layer {...p} depth={0.08} className="overflow-hidden rounded-[28px] border border-border/60 bg-card">
        {CAPABILITIES.map(({ key, model }, i) => (
          <Animated.View
            // key đổi khi được xem → mount lại → `entering` chạy (entering chỉ chạy lúc mount)
            key={`${key}-${p.visited}`}
            entering={p.visited ? riseIn.delay(i * 45) : undefined}
            className={cn("flex-row gap-3 px-4 py-3.5", i > 0 && "border-t border-border/60", !p.visited && "opacity-0")}
          >
            <View className="size-9 items-center justify-center rounded-full bg-muted">
              <Icon as={CAPABILITY_ICONS[key]} size={17} className="text-foreground" />
            </View>
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className="flex-1 text-[15px] font-medium" numberOfLines={1}>
                  {t(`capabilities.${key}`)}
                </Text>
                <Text className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground">{model}</Text>
              </View>
              <Text className="text-[13px] leading-[18px] text-muted-foreground">{t(`capabilities.desc.${key}`)}</Text>
            </View>
          </Animated.View>
        ))}
      </Layer>
    </View>
  );
}

// ── 5. Quy trình 3 bước ───────────────────────────────────────────────────
function DrawLine({ active }: { active: boolean }) {
  // Vạch nối 3 bước "vẽ" từ trên xuống khi slide được xem (web drawLine).
  const reduce = useReducedMotion();
  const h = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (active && !reduce) h.set(withDelay(80, withTiming(1, { duration: 600, easing: EASE_OUT })));
  }, [active, reduce, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.get() }] }));
  return (
    <Animated.View
      className="absolute bottom-10 left-[33.5px] top-10 w-px bg-foreground/30"
      style={[style, { transformOrigin: "top" }]}
    />
  );
}

export function WorkflowSlide(p: SlideProps) {
  const { t } = useTranslation();
  return (
    <SlideBody
      visual={
        <Layer {...p} depth={0.12} className="gap-1 rounded-[28px] border border-border/60 bg-card p-4">
          <DrawLine active={p.visited} />
          {STEPS.map((key, i) => (
            <Animated.View
              key={`${key}-${p.visited}`}
              entering={p.visited ? riseIn.delay(120 + i * 90) : undefined}
              className={cn("flex-row gap-4 py-2.5", !p.visited && "opacity-0")}
            >
              <View className="size-9 items-center justify-center rounded-full bg-foreground">
                <Text className="text-xs font-semibold text-background">{String(i + 1).padStart(2, "0")}</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-[10px] font-medium uppercase tracking-[2px] text-muted-foreground">
                  {t(`workflow.steps.${key}.label`)}
                </Text>
                <Text className="font-heading text-xl">{t(`workflow.steps.${key}.title`)}</Text>
                <Text className="text-[13px] leading-[18px] text-muted-foreground">{t(`workflow.steps.${key}.desc`)}</Text>
              </View>
            </Animated.View>
          ))}
        </Layer>
      }
    >
      <Layer {...p} depth={0.04} className="gap-3">
        <Eyebrow>{t("workflow.eyebrow")}</Eyebrow>
        <Text role="heading" className="font-heading text-3xl leading-tight">
          {t("workflow.title")}
        </Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">{t("workflow.subtitle")}</Text>
      </Layer>
    </SlideBody>
  );
}

// ── 6. Lời kết (CTA nằm ở thanh dưới) ────────────────────────────────────
function LitWord({ word, index, active }: { word: string; index: number; active: boolean }) {
  // Câu lớn sáng dần từng chữ (web ScrollWords) — ở đây theo thời gian khi slide được xem.
  const reduce = useReducedMotion();
  const o = useSharedValue(reduce ? 1 : 0.2);
  useEffect(() => {
    if (active && !reduce) o.set(withDelay(index * 35, withTiming(1, { duration: APP_DURATION.slow, easing: EASE_OUT })));
  }, [active, reduce, index, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View style={style}>
      <Text className="font-heading text-[32px] leading-tight">{word} </Text>
    </Animated.View>
  );
}

export function ClosingSlide(p: SlideProps) {
  const { t } = useTranslation();
  const statement = t("closing.statement");
  return (
    <SlideBody
      visual={
        <Layer {...p} depth={0.14} className="flex-1">
          <WallWindow />
        </Layer>
      }
    >
      <Layer {...p} depth={0.04} className="gap-3">
        <Eyebrow>{t("closing.eyebrow")}</Eyebrow>
        <View className="flex-row flex-wrap" accessible accessibilityRole="header" accessibilityLabel={statement}>
          {statement.split(" ").map((word, i) => (
            <LitWord key={`${word}-${i}`} word={word} index={i} active={p.visited} />
          ))}
        </View>
      </Layer>
    </SlideBody>
  );
}
