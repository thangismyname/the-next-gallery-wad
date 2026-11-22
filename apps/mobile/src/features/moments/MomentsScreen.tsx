import { MOMENT_ASPECT, feedPeople, filterMoments, isMomentUnseen, type Moment, type MomentFilter } from "@tng/shared";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { Bell, Camera, Clock3, RotateCw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type FlatList,
  Platform,
  RefreshControl,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PullRefreshIndicator } from "@/components/shared/PullRefreshIndicator";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AppHeader, useHeaderScroll, useTabContentInsets, useTabEnterStyle } from "@/features/navigation";
import { HEADER_COLLAPSE_DISTANCE, HEADER_ROW, HEADER_TITLE_ROW, tabBarSpace } from "@/features/navigation/layout";
import { useTheme } from "@/hooks/useTheme";
import { fadeIn } from "@/lib/motion";

import { useSession } from "@/features/auth/session";

import { CARD_CHROME, MomentCard } from "./components/MomentCard";
import { FILTER_BAR_HEIGHT, MomentFilterBar } from "./components/MomentFilterBar";
import { openMomentCamera } from "./newMoment";
import { useMomentInbox } from "./useMomentInbox";
import { useMomentsFeed } from "./useMomentsFeed";
import { useMomentsSeen } from "./useMomentsSeen";

const CARD_MAX = 520;
const NOT_LOADED = "9999-12-31T00:00:00.000Z";

/**
 * Moments tab (web `MomentsView`): a vertical **pager** — one swipe = one moment
 * (Locket-style square card with reactions + memes), like the web snap feed.
 * Each page = the full screen; the card sits centered between the header + the
 * filter row (All · Me · friends, rose ring = new) and the BottomBar. Only the
 * current page plays its video; viewing a page moves the "seen" mark. New
 * moments: header Add menu ("+") → Camera (Moment mode) or one photo / video from the library → `MomentReview`. Polled every 30 s
 * while open (no WebSocket on mobile yet). Multi-photo / with friends = `/moment-create`; bell under
 * the avatar = `/moment-inbox` (invitations + notifications, polled) → `/moment-fill`.
 */
export function MomentsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const safe = useSafeAreaInsets();
  const insets = useTabContentInsets();
  const enterStyle = useTabEnterStyle();
  const focused = useIsFocused();
  const { width, height: windowHeight } = useWindowDimensions();
  const feed = useMomentsFeed();
  const { moments: allMoments, isPending, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage, toggleReaction, remove } = feed;
  const user = useSession().data?.user;
  // Bell under the avatar (like Gallery's sort): invitations + saved notifications, polled.
  const inbox = useMomentInbox();
  const meId = user?.id ?? null;

  // Who to watch + "new since last time" (baseline = the mark at app start).
  const [filter, setFilter] = useState<MomentFilter>("all");
  const seen = useMomentsSeen();
  // Until AsyncStorage loads, nothing counts as new (no flash of "New" badges).
  const baseline = seen.ready ? seen.baseline : NOT_LOADED;
  const people = useMemo(() => feedPeople(allMoments, meId, baseline), [allMoments, meId, baseline]);
  const moments = useMemo(() => filterMoments(allMoments, filter, meId), [allMoments, filter, meId]);
  const filterKey = typeof filter === "object" ? filter.userId : filter;
  const showFilter = allMoments.length > 0 || filter !== "all";
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<Moment>>(null);

  const [pageHeight, setPageHeight] = useState(windowHeight);

  // `/moments?id=` (Library "Recent moments") → scroll to that moment once it's in
  // the list, then clear the param. Animated so `onMomentumScrollEnd` sets `page`.
  const { id: openId } = useLocalSearchParams<{ id?: string }>();
  const openIndex = openId ? moments.findIndex((m) => m.id === openId) : -1;
  useEffect(() => {
    if (!openId || openIndex < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: openIndex * pageHeight, animated: true });
      router.setParams({ id: undefined });
    }, 60);
    return () => clearTimeout(timer);
  }, [openId, openIndex, pageHeight]);

  // Space for the card on a page: under the header (its big "The Next Gallery"
  // title row while at the top) + the filter row, above the tab bar.
  const filterTop = safe.top + HEADER_ROW;
  const top = filterTop + HEADER_TITLE_ROW + (showFilter ? FILTER_BAR_HEIGHT : 0) + 4;
  const bottom = tabBarSpace(safe.bottom) + 16;
  const pageBottom = bottom;
  const available = pageHeight - top - pageBottom - CARD_CHROME;
  const size = Math.max(160, Math.min(CARD_MAX, width - insets.left - insets.right - 32, Math.floor(available / MOMENT_ASPECT)));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  const { scrollY, onScroll } = useHeaderScroll({
    hideTabBar: false, // pager pages are sized around the tab bar
    onPullRefresh: Platform.OS === "ios" ? () => void refresh() : undefined,
  });

  // The filter row sits under the expanded title and rides up as it collapses.
  const filterStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scrollY.get(), [0, HEADER_COLLAPSE_DISTANCE], [HEADER_TITLE_ROW, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== pageHeight) setPageHeight(h);
  };
  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.y / pageHeight));


  // The current page counts as seen.
  const { markSeen } = seen;
  const current = moments[page];
  useEffect(() => {
    if (current && focused) markSeen(current.createdAt);
  }, [current, focused, markSeen]);

  const changeFilter = (next: MomentFilter) => {
    setFilter(next);
    setPage(0);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Moment; index: number }) => (
      <View style={{ height: pageHeight, paddingTop: top, paddingBottom: pageBottom }} className="justify-center">
        <MomentCard
          moment={item}
          size={size}
          active={focused && index === page}
          unseen={isMomentUnseen(item, baseline)}
          onReact={toggleReaction}
          onRemove={remove}
        />
      </View>
    ),
    [pageHeight, top, pageBottom, size, focused, page, baseline, toggleReaction, remove],
  );

  const empty = isPending ? (
    <View style={{ height: pageHeight, paddingTop: top, paddingBottom: bottom }} className="items-center justify-center gap-3">
      <Skeleton className="h-9 rounded-full" style={{ width: size * 0.6 }} />
      <Skeleton className="rounded-[36px]" style={{ width: size, height: size * MOMENT_ASPECT }} />
    </View>
  ) : isError ? (
    <Empty height={pageHeight} title={t("moments.loadFailed")} icon={RotateCw}>
      <Button variant="outline" onPress={() => void refetch()}>
        <Text>{t("moments.retry")}</Text>
      </Button>
    </Empty>
  ) : filter !== "all" ? (
    <Empty height={pageHeight} title={t("moments.emptyFiltered")} icon={Clock3} />
  ) : (
    <Empty height={pageHeight} title={t("moments.empty")} hint={t("moments.emptyHint")} icon={Clock3}>
      <Button className="rounded-full" onPress={openMomentCamera}>
        <Icon as={Camera} size={16} className="text-primary-foreground" />
        <Text>{t("camera.momentsMode")}</Text>
      </Button>
    </Empty>
  );

  return (
    <View className="flex-1 bg-background" onLayout={onLayout}>
      <Animated.View style={[{ flex: 1 }, enterStyle]}>
        <Animated.FlatList
          ref={listRef}
          key={filterKey}
          data={moments}
          extraData={page}
          renderItem={renderItem}
          keyExtractor={(m) => m.id}
          // One swipe = one moment.
          pagingEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onPageEnd}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={2}
          refreshControl={
            Platform.OS === "android" ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} progressViewOffset={top} />
            ) : undefined
          }
          ListEmptyComponent={empty}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="absolute inset-x-0 items-center" style={{ bottom: bottom - 8 }}>
                <ActivityIndicator color={colors.mutedForeground} />
              </View>
            ) : undefined
          }
        />
      </Animated.View>
      {Platform.OS === "ios" ? <PullRefreshIndicator scrollY={scrollY} refreshing={refreshing} top={top} /> : null}

      {showFilter ? (
        <Animated.View
          className="absolute inset-x-0"
          style={[{ top: filterTop, paddingLeft: insets.left, paddingRight: insets.right }, filterStyle]}
        >
          <MomentFilterBar
            value={filter}
            onChange={changeFilter}
            people={people}
            me={user ? { name: user.name, image: user.image ?? null } : null}
          />
        </Animated.View>
      ) : null}

      <AppHeader
        scrollY={scrollY}
        add={["moment-camera", "moment-multi", "moment-account", "moment-device"]}
        action={{
          icon: Bell,
          label: t("moments.invitations"),
          badge: inbox.count,
          onPress: () => router.push("/moment-inbox"),
        }}
      />
    </View>
  );
}

function Empty({
  height,
  title,
  hint,
  icon,
  children,
}: {
  height: number;
  title: string;
  hint?: string;
  icon: typeof Clock3;
  children?: React.ReactNode;
}) {
  return (
    <Animated.View entering={fadeIn} className="items-center justify-center gap-3 px-8" style={{ height }}>
      <Icon as={icon} size={40} className="text-muted-foreground/50" />
      <Text className="text-center text-[17px] font-semibold">{title}</Text>
      {hint ? <Text className="text-center text-[14px] text-muted-foreground">{hint}</Text> : null}
      <View className="pt-2">{children}</View>
    </Animated.View>
  );
}
