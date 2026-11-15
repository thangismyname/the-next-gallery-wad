import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppLogo } from "@/components/shared/AppLogo";
import { GalleryWall } from "@/components/shared/GalleryWall";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { LanguageSwitch } from "@/features/auth/components/LanguageSwitch";
import { useLayout } from "@/hooks/useLayout";
import { riseIn } from "@/lib/motion";

import { PageDots } from "./components/PageDots";
import { Slide } from "./components/Slide";
import {
  CapabilitiesSlide,
  ClosingSlide,
  HeroSlide,
  PipelineSlide,
  ShowcaseSlide,
  WorkflowSlide,
  type SlideProps,
} from "./components/Slides";
import { SLIDES, type SlideId } from "./landingData";

const SLIDE_COMPONENTS: Record<SlideId, (p: SlideProps) => React.JSX.Element> = {
  hero: HeroSlide,
  showcase: ShowcaseSlide,
  pipeline: PipelineSlide,
  capabilities: CapabilitiesSlide,
  workflow: WorkflowSlide,
  closing: ClosingSlide,
};
const LAST = SLIDES.length - 1;
/** Chiều cao thanh trên / dưới (không tính safe area) — slide chừa chỗ cho chúng. */
const TOP_BAR = 56;
const BOTTOM_BAR = 128;

/**
 * Màn đầu tiên khi chưa đăng nhập (= landing web, cùng nội dung) dạng carousel vuốt ngang:
 * Hero · AI showcase · Pipeline · Tính năng · Quy trình · Lời kết. Chuyển trang kiểu pager
 * gốc: 1 vuốt = 1 trang, dừng nhanh, nội dung trễ nhẹ theo ngón tay, rung nhẹ khi qua nửa
 * trang (trang mới được "nhận" ngay lúc đó → hiệu ứng của nó chạy sớm, không chờ dừng hẳn).
 * Bố cục mobile: hình trên, chữ dưới (gần ngón cái), thanh trên / dưới trong suốt. Đăng xuất → về đây.
 * Thanh trên: logo + Đăng nhập. Thanh dưới: chấm trang + Ngôn ngữ (trang đầu) / Bỏ qua + Tiếp;
 * slide cuối: Tạo tài khoản + Đăng nhập.
 */
/**
 * Nền trang đầu = bức tường gallery có chip AI toàn màn (giống màn đăng nhập), mờ dần khi
 * vuốt sang trang 2. Nằm sau carousel nên các trang khác vẫn nền trơn.
 */
function HeroBackdrop({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: width ? interpolate(scrollX.get(), [0, width * 0.7], [1, 0], Extrapolation.CLAMP) : 1,
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0 }, style]}>
      <GalleryWall />
    </Animated.View>
  );
}

export function WelcomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

  const settle = useCallback((i: number) => {
    setIndex(i);
    setVisited((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }, []);
  // Trang hiện tại = trang chiếm > nửa màn → đổi ngay khi vuốt qua nửa (kèm rung nhẹ như picker iOS).
  const onPageCross = useCallback(
    (i: number) => {
      void Haptics.selectionAsync();
      settle(i);
    },
    [settle],
  );
  useAnimatedReaction(
    () => (width ? Math.min(LAST, Math.max(0, Math.round(scrollX.get() / width))) : 0),
    (page, prev) => {
      if (prev !== null && page !== prev) scheduleOnRN(onPageCross, page);
    },
    [width, onPageCross],
  );
  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
  };

  // Xoay máy / đổi cỡ cửa sổ (iPad split view, foldable) → giữ đúng trang đang xem.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * width, animated: false });
    scrollX.set(indexRef.current * width);
  }, [width, scrollRef, scrollX]);

  const last = index === LAST;
  const openAuth = (tab?: "register") => router.push(tab ? { pathname: "/auth", params: { tab } } : "/auth");

  return (
    <View className="flex-1 bg-background">
      <HeroBackdrop scrollX={scrollX} width={width} />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        // pager gốc: 1 lần vuốt = đúng 1 trang, dừng nhanh; Android không có hiệu ứng kéo giãn mép
        decelerationRate="fast"
        disableIntervalMomentum
        overScrollMode="never"
        bounces={Platform.OS === "ios"}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        accessibilityRole="adjustable"
      >
        {SLIDES.map((id, i) => {
          const Content = SLIDE_COMPONENTS[id];
          return (
            <Slide
              key={id}
              width={width}
              top={insets.top + TOP_BAR + 8}
              bottom={insets.bottom + BOTTOM_BAR + 8}
              left={insets.left}
              right={insets.right}
            >
              <Content scrollX={scrollX} index={i} width={width} visited={visited.has(i)} />
            </Slide>
          );
        })}
      </Animated.ScrollView>

      {/* Thanh trên — trong suốt (slide chừa chỗ, không có gì chạy bên dưới) */}
      <View
        className="absolute inset-x-0 top-0 flex-row items-center justify-between"
        style={{ paddingTop: insets.top, height: insets.top + TOP_BAR, paddingLeft: insets.left + 20, paddingRight: insets.right + 12 }}
      >
        <View className="flex-row items-center gap-2">
          <AppLogo size={22} />
          <Text className="text-xs font-medium uppercase tracking-[3px] text-muted-foreground">The Next Gallery</Text>
        </View>
        <Pressable onPress={() => openAuth()} hitSlop={8} accessibilityRole="button" className="rounded-full px-3 py-2 active:opacity-60">
          <Text className="text-sm font-medium">{t("nav.login")}</Text>
        </Pressable>
      </View>

      {/* Thanh dưới */}
      <View
        className="absolute inset-x-0 bottom-0 items-center gap-4"
        style={{ paddingBottom: insets.bottom + 16, paddingTop: 12, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }}
      >
        <PageDots count={SLIDES.length} scrollX={scrollX} width={width} onSelect={goTo} />
        <View className="w-full max-w-[560px]" style={{ height: 84 }}>
          {last ? (
            <Animated.View key="cta" entering={riseIn} className="gap-3">
              <Button size="lg" onPress={() => openAuth("register")} className="h-12 rounded-full">
                <Text>{t("closing.cta")}</Text>
              </Button>
              <View className="flex-row items-center justify-center gap-1">
                <Text className="text-sm text-muted-foreground">{t("auth.alreadyHaveAccount")}</Text>
                <Pressable onPress={() => openAuth()} hitSlop={8} accessibilityRole="button">
                  <Text className="text-sm font-medium underline">{t("nav.login")}</Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <View className="flex-row items-center justify-between">
              {index === 0 ? (
                // Chọn ngôn ngữ ngay từ trang đầu (không bọc fade: LanguageSwitch là Liquid Glass).
                <LanguageSwitch />
              ) : (
                <Pressable onPress={() => goTo(LAST)} hitSlop={8} accessibilityRole="button" className="px-2 py-2 active:opacity-60">
                  <Text className="text-sm text-muted-foreground">{t("welcome.skip")}</Text>
                </Pressable>
              )}
              <Button onPress={() => goTo(index + 1)} className="h-12 flex-row gap-2 rounded-full px-6">
                <Text>{index === 0 ? t("welcome.getStarted") : t("welcome.next")}</Text>
                <Icon as={ArrowRight} size={16} className="text-primary-foreground" />
              </Button>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
