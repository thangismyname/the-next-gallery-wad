import { formatDateTime, type MediaListItem } from "@tng/shared";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { Download, Ellipsis, Heart, Info, Pencil, Play, Share as ShareIcon, Trash2, X, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type WithTimingConfig } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { GlassButton } from "@/components/shared/GlassButton";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { APP_DURATION, EASE_OUT, fadeOut, riseIn } from "@/lib/motion";

import { useDeveloperMode } from "@/hooks/useDeveloperMode";

import { MediaMenu } from "../components/MediaMenu";
import { PhotosPermissionError, useMediaActions } from "../useMediaActions";
import { fitRect, type Rect } from "./geometry";
import { InfoSheet } from "./InfoSheet";
import { LightboxPage, type InfoLayout } from "./LightboxPage";
import { mediaSources } from "./sources";
import { useViewerGestures } from "./useViewerGestures";
import { VideoControls } from "./VideoControls";

const OPEN: WithTimingConfig = { duration: APP_DURATION.slow, easing: EASE_OUT };
const CLOSE: WithTimingConfig = { duration: APP_DURATION.base + 40, easing: EASE_OUT };
const FADE: WithTimingConfig = { duration: APP_DURATION.base, easing: EASE_OUT };
/** Show the pages even if the current image is slow to load. */
const REVEAL_TIMEOUT = 700;

type Phase = "opening" | "open" | "closing";
type Busy = string | null;

/** Extra "⋯" action of the caller (e.g. album: Set as cover / Remove from album). */
export interface LightboxAction {
  key: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  /** i18n key of the toast shown when it succeeds. */
  doneKey?: string;
  /** Hide it for some items (e.g. "Remove" on a photo someone else added). */
  hidden?: (item: MediaListItem) => boolean;
  onPress: (item: MediaListItem) => Promise<unknown>;
}

/**
 * Full-screen viewer over everything (root PortalHost → also covers the tab bar).
 *
 * - Open: a "ghost" copy flies from the grid tile to the fitted rect; it stays
 *   until the current page's image has loaded (no flash), then the pages show.
 *   Close (X, swipe down, Android back): the ghost flies back to the tile of the
 *   photo being viewed, or shrinks + fades if that tile is off-screen.
 * - Pages: only previous / current / next are mounted; position, zoom, dismiss
 *   drag and info lift are shared values (`useViewerGestures`) — no React work
 *   while a finger is down.
 * - Single tap: hide / show the chrome (black backdrop when hidden). Zooming in
 *   or dragging to dismiss hides it too. Glass chrome (de)materializes natively
 *   — never faded, never slid.
 * - Drag up (or the ⓘ button): info sheet with the photo's details (iOS Photos
 *   style). The sheet sits inside the drag detector, so dragging on the sheet
 *   itself moves it too (down → back to the photo).
 */
export function Lightbox({
  items,
  startId,
  originRect,
  getTileRect,
  onEndReached,
  onIndexChange,
  onClose,
  actions: extraActions,
  canEdit,
}: {
  items: MediaListItem[];
  startId: string;
  /** Grid tile the viewer opens from (null → zoom from the center). */
  originRect: Rect | null;
  getTileRect: (id: string) => Promise<Rect | null>;
  onEndReached: () => void;
  /** The viewed photo changed — the grid behind scrolls to it (close flies back to a visible tile). */
  onIndexChange?: (id: string) => void;
  onClose: () => void;
  /** Caller's items in the ⋯ menu, after Share. */
  actions?: LightboxAction[];
  /**
   * false → not the viewer's own photo (shared album): no heart / trash / add to
   * album / labels — the API would refuse them. Default: everything editable.
   */
  canEdit?: (item: MediaListItem) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const actions = useMediaActions();
  const { devModeEnabled } = useDeveloperMode();

  const [startIndex] = useState(() => Math.max(items.findIndex((m) => m.id === startId), 0));
  const [rawIndex, setIndex] = useState(startIndex);
  const [phase, setPhase] = useState<Phase>("opening");
  const [startLoaded, setStartLoaded] = useState(false);
  const [revealTimedOut, setRevealTimedOut] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Live Photo: id of the photo whose video is playing (another page = stopped).
  const [liveId, setLiveId] = useState<string | null>(null);
  const stopLive = useCallback(() => setLiveId(null), []);

  // Clamped: the list can shrink under the viewer (delete).
  const index = Math.max(Math.min(rawIndex, items.length - 1), 0);
  const current = items[index] as MediaListItem | undefined;
  const editable = current ? (canEdit?.(current) ?? true) : false;
  const base = fitRect(current?.width, current?.height, width, height);

  // ── Stable callbacks for the gesture worklets (identity never changes) ────
  const closeRef = useRef<(from?: Rect) => void>(() => {});
  const onPageChange = useCallback((i: number) => {
    setIndex(i);
    setHiRes(false);
  }, []);
  const onDismiss = useCallback((from: Rect) => closeRef.current(from), []);
  const onToggleChrome = useCallback(() => setChromeVisible((v) => !v), []);
  const onHiRes = useCallback(() => setHiRes(true), []);
  const onZoomIn = useCallback(() => setChromeVisible(false), []);

  const { values, dragGesture, tapGesture, syncIndex, openInfo, closeInfo } = useViewerGestures({
    width,
    height,
    count: items.length,
    startIndex,
    baseWidth: base.width,
    baseHeight: base.height,
    onPageChange,
    onDismiss,
    onToggleChrome,
    onHiRes,
    onZoomIn,
    onDragChange: setDragging,
    onInfoChange: setInfoOpen,
  });

  // ── Ghost (open / close flight) ──────────────────────────────────────────
  const backdrop = useSharedValue(0);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const gw = useSharedValue(0);
  const gh = useSharedValue(0);
  const ghostOpacity = useSharedValue(1);
  const [ghostItem, setGhostItem] = useState<MediaListItem | undefined>(current);

  const flyGhost = useCallback(
    (from: Rect, to: Rect, config: WithTimingConfig, done: () => void) => {
      gx.set(from.x);
      gy.set(from.y);
      gw.set(from.width);
      gh.set(from.height);
      gx.set(withTiming(to.x, config));
      gy.set(withTiming(to.y, config));
      gw.set(withTiming(to.width, config));
      gh.set(
        withTiming(to.height, config, (finished) => {
          "worklet";
          if (finished) scheduleOnRN(done);
        }),
      );
    },
    [gx, gy, gw, gh],
  );

  // Open: tile → fitted rect.
  const [openFrom] = useState(() => originRect);
  const [openTo] = useState(() => base);
  useEffect(() => {
    const from = openFrom ?? {
      x: openTo.x + openTo.width * 0.1,
      y: openTo.y + openTo.height * 0.1,
      width: openTo.width * 0.8,
      height: openTo.height * 0.8,
    };
    backdrop.set(withTiming(1, OPEN));
    flyGhost(from, openTo, OPEN, () => setPhase("open"));
  }, [openFrom, openTo, backdrop, flyGhost]);

  // Reveal the pages once the opened image has loaded (or after a timeout).
  const onLoaded = useCallback((id: string) => {
    if (id === startId) setStartLoaded(true);
  }, [startId]);
  useEffect(() => {
    if (phase !== "open") return;
    const timer = setTimeout(() => setRevealTimedOut(true), REVEAL_TIMEOUT);
    return () => clearTimeout(timer);
  }, [phase]);
  const revealed = phase !== "opening" && (startLoaded || revealTimedOut);

  const close = async (from?: Rect) => {
    if (phase === "closing") return;
    if (!current) return onClose();
    const start = from ?? base;
    const target = await getTileRect(current.id);
    // Continue the backdrop from where a dismiss drag left it.
    backdrop.set(backdrop.get() * (1 - values.dismiss.get() * 0.9));
    values.dismiss.set(0);
    setGhostItem(current);
    ghostOpacity.set(1);
    setPhase("closing");
    backdrop.set(withTiming(0, CLOSE));
    if (target) {
      flyGhost(start, target, CLOSE, onClose);
    } else {
      const shrunk = {
        x: start.x + start.width * 0.15,
        y: start.y + start.height * 0.15,
        width: start.width * 0.7,
        height: start.height * 0.7,
      };
      flyGhost(start, shrunk, CLOSE, onClose);
      ghostOpacity.set(withTiming(0, CLOSE));
    }
  };
  useEffect(() => {
    closeRef.current = (from) => void close(from);
  });

  // Android back: close the info sheet first, then the viewer.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (infoOpen) closeInfo();
      else closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, [infoOpen, closeInfo]);

  // ── Data around the current page ─────────────────────────────────────────
  // List shrank under us (delete) → move the shared index into range too.
  useEffect(() => {
    if (rawIndex !== index) syncIndex(index);
  }, [rawIndex, index, syncIndex]);

  // Preload neighbours; load more of the library near the end.
  useEffect(() => {
    const near = [items[index + 1], items[index - 1], items[index + 2]].filter(Boolean) as MediaListItem[];
    void Image.prefetch(
      near.map((m) => mediaSources(m).display),
      { cachePolicy: "memory-disk" },
    );
    if (index >= items.length - 3) onEndReached();
  }, [index, items, onEndReached]);

  const currentId = current?.id;
  useEffect(() => {
    if (currentId && phase === "open") onIndexChange?.(currentId);
    // Only when the photo changes (not when the parent re-creates the callback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, phase]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const showToast = (key: string, translated = false) => {
    const text = translated ? key : t(key);
    setToast(text);
    setTimeout(() => setToast((v) => (v === text ? null : v)), 2200);
  };

  const run = async (kind: Busy, fn: () => Promise<void>, doneKey?: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
      if (doneKey) showToast(doneKey);
    } catch (error) {
      showToast(error instanceof PhotosPermissionError ? "lightbox.savePermission" : "lightbox.actionFailed");
    } finally {
      setBusy(null);
    }
  };

  const toggleFavorite = () => {
    if (!current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    actions.setFavorite(current, !current.isFavorite).catch(() => showToast("lightbox.actionFailed"));
  };

  /** Similar photo tapped in the info sheet → show it (the sheet stays open). */
  const selectSimilar = (item: MediaListItem) => {
    const i = items.findIndex((m) => m.id === item.id);
    if (i < 0) return showToast("lightbox.similarNotLoaded");
    setIndex(i);
    setHiRes(false);
    syncIndex(i);
  };

  const confirmTrash = () => {
    if (!current) return;
    Alert.alert(t("selection.deleteConfirmTitle"), t("selection.deleteConfirmDesc", { count: 1 }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("selection.moveToTrash"),
        style: "destructive",
        onPress: () => {
          const last = items.length === 1;
          void run(
            "trash",
            async () => {
              await actions.moveToTrash(current);
              if (last) return onClose();
              const next = Math.min(index, items.length - 2);
              setIndex(next);
              syncIndex(next);
            },
            "lightbox.trashed",
          );
        },
      },
    ]);
  };

  // ── Layout + animated styles ─────────────────────────────────────────────
  const chromeShown = phase === "open" && chromeVisible && !dragging;
  const sheetHeight = Math.min(height * 0.48, 440);
  const infoLayout: InfoLayout = {
    top: insets.top + 60,
    height: height - sheetHeight - 12 - (insets.top + 60),
  };

  const themeLayer = useSharedValue(1);
  useEffect(() => {
    themeLayer.set(withTiming(chromeShown || infoOpen ? 1 : 0, FADE));
  }, [chromeShown, infoOpen, themeLayer]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() * (1 - values.dismiss.get() * 0.9) }));
  const themeLayerStyle = useAnimatedStyle(() => ({ opacity: themeLayer.get() }));
  const ghostStyle = useAnimatedStyle(() => ({
    left: gx.get(),
    top: gy.get(),
    width: gw.get(),
    height: gh.get(),
    opacity: ghostOpacity.get(),
  }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: withTiming(chromeShown ? 1 : 0, FADE) }));

  const ghostSources = ghostItem ? mediaSources(ghostItem) : null;
  const showPages = revealed && phase !== "closing";
  const dateText = current ? formatDateTime(current.takenAt ?? current.createdAt, i18n.language) : "";
  const window = [index - 1, index, index + 1].filter((i) => i >= 0 && i < items.length);

  return (
    <View style={StyleSheet.absoluteFill}>
      <StatusBar
        hidden={phase === "open" && !chromeShown && !infoOpen}
        style={isDark || !(chromeShown || infoOpen) ? "light" : "dark"}
        animated
      />

      <GestureDetector gesture={dragGesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {/* Backdrop: black, with the theme background over it while the chrome shows. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]} className="bg-black">
            <Animated.View style={[StyleSheet.absoluteFill, themeLayerStyle]} className="bg-background" />
          </Animated.View>

          {/* Pages (mounted while the ghost flies so they start loading; shown once loaded). */}
          <GestureDetector gesture={tapGesture}>
            <View
              style={[StyleSheet.absoluteFill, { opacity: showPages ? 1 : 0 }]}
              pointerEvents={showPages ? "auto" : "none"}
              collapsable={false}
            >
              {window.map((i) => (
                <LightboxPage
                  key={items[i].id}
                  item={items[i]}
                  pageIndex={i}
                  width={width}
                  height={height}
                  values={values}
                  hiRes={i === index && hiRes}
                  playing={i === index && showPages}
                  livePlaying={i === index && liveId === items[i].id}
                  onLiveEnd={stopLive}
                  infoLayout={infoLayout}
                  onLoaded={onLoaded}
                  detections={devModeEnabled && i === index}
                />
              ))}
            </View>
          </GestureDetector>

          {/* Inside the drag detector: dragging on the sheet moves it (down → back to the photo). */}
          {current ? (
            <InfoSheet
              item={current}
              values={values}
              sheetHeight={sheetHeight}
              bottomInset={insets.bottom}
              active={infoOpen}
              onSelectSimilar={selectSimilar}
            />
          ) : null}
        </View>
      </GestureDetector>

      {/* Ghost flying between the grid tile and the viewer. */}
      {!showPages && ghostSources ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", overflow: "hidden" }, ghostStyle]}>
          <Image
            source={{ uri: ghostSources.display }}
            placeholder={{ uri: ghostSources.thumb }}
            placeholderContentFit="cover"
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
      ) : null}

      {/* Tap outside the ⋯ menu closes it (also blocks photo gestures while it is open). */}
      {menuOpen ? (
        <Pressable
          accessibilityLabel={t("common.cancel")}
          onPress={() => setMenuOpen(false)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Top bar: close + date · favorite + ⋯ (its menu drops below, right-aligned). */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 top-0"
        style={{ paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }}
      >
        <View pointerEvents="box-none" className="flex-row items-center gap-3">
          <GlassButton
            size={44}
            visible={chromeShown || infoOpen}
            accessibilityLabel={t("lightbox.close")}
            onPress={() => (infoOpen ? closeInfo() : closeRef.current())}
          >
            <Icon as={X} size={22} />
          </GlassButton>
          <View className="flex-1" pointerEvents="none">
            {dateText && !infoOpen ? (
              <Animated.View style={dateStyle}>
                <Text numberOfLines={1} className="text-[15px] font-medium">
                  {dateText}
                </Text>
              </Animated.View>
            ) : null}
          </View>
          {current ? (
            <>
              {current.motionUrl ? (
                <GlassButton
                  size={44}
                  visible={chromeShown && !infoOpen}
                  accessibilityLabel={t("lightbox.live")}
                  accessibilityState={{ selected: liveId === current.id }}
                  onPress={() => setLiveId((id) => (id === current.id ? null : current.id))}
                >
                  <Icon as={Play} size={19} fill={liveId === current.id ? "currentColor" : "none"} />
                </GlassButton>
              ) : null}
              {editable ? (
              <GlassButton
                size={44}
                visible={chromeShown && !infoOpen}
                accessibilityLabel={t(current.isFavorite ? "lightbox.unfavorite" : "lightbox.favorite")}
                accessibilityState={{ selected: current.isFavorite }}
                onPress={toggleFavorite}
              >
                <Icon as={Heart} size={21} fill={current.isFavorite ? "currentColor" : "none"} />
              </GlassButton>
              ) : null}
              <GlassButton
                size={44}
                visible={chromeShown && !infoOpen}
                accessibilityLabel={t("lightbox.more")}
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen((v) => !v)}
              >
                <Icon as={Ellipsis} size={22} />
              </GlassButton>
            </>
          ) : null}
        </View>
        {menuOpen && current ? (
          <View pointerEvents="box-none" className="mt-2.5 items-end">
            <MediaMenu
              mediaIds={[current.id]}
              onNotify={(text) => showToast(text, true)}
              onDone={() => setMenuOpen(false)}
              items={[
                {
                  key: "share",
                  label: t("selection.share"),
                  icon: ShareIcon,
                  busy: busy === "share",
                  onPress: () => {
                    setMenuOpen(false);
                    void run("share", () => actions.share(current));
                  },
                },
                ...(extraActions ?? [])
                  .filter((action) => !action.hidden?.(current))
                  .map((action) => ({
                    key: action.key,
                    label: action.label,
                    icon: action.icon,
                    destructive: action.destructive,
                    busy: busy === action.key,
                    onPress: () => {
                      setMenuOpen(false);
                      void run(action.key, async () => {
                        await action.onPress(current);
                      }, action.doneKey);
                    },
                  })),
              ]}
              library={editable}
            />
          </View>
        ) : null}
      </View>

      {/* Toast above the action bar. */}
      {toast ? (
        <Animated.View
          entering={riseIn}
          exiting={fadeOut}
          pointerEvents="none"
          className="absolute self-center rounded-full bg-foreground/90 px-4 py-2.5"
          style={{ bottom: insets.bottom + 96 }}
        >
          <Text className="text-[15px] font-medium text-background">{toast}</Text>
        </Animated.View>
      ) : null}

      {/* Video: tua · tốc độ · âm lượng — cấp màn hình, ngay trên thanh công cụ (không bị zoom). */}
      {current?.mediaType === "video" ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 items-center px-3"
          style={{ bottom: Math.max(insets.bottom - 6, 12) + 56 + 8 }}
        >
          <VideoControls visible={chromeShown && !infoOpen} />
        </View>
      ) : null}

      {/* Bottom glass action bar. */}
      {current ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 items-center"
          style={{ bottom: Math.max(insets.bottom - 6, 12) }}
        >
          <GlassPanel radius={999} padding={6} visible={chromeShown && !infoOpen}>
            {/* Favorite + ⋯ (share, album, labels) live in the top bar. */}
            <View className="flex-row items-center gap-2">
              <ActionButton
                icon={Pencil}
                label={t("lightbox.edit")}
                // Photo editing isn't built yet (web AI Studio "Editing" is a placeholder too).
                onPress={() => showToast("common.comingSoon")}
                color={colors.foreground}
              />
              <ActionButton
                icon={Download}
                label={t("selection.download")}
                busy={busy === "save"}
                onPress={() => void run("save", () => actions.saveToPhotos(current), "lightbox.saved")}
                color={colors.foreground}
              />
              <ActionButton
                icon={Info}
                label={t("lightbox.detail")}
                onPress={openInfo}
                color={colors.foreground}
              />
              {editable ? (
                <ActionButton
                  icon={Trash2}
                  label={t("selection.delete")}
                  busy={busy === "trash"}
                  onPress={confirmTrash}
                  color={colors.foreground}
                />
              ) : null}
            </View>
          </GlassPanel>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  busy,
  color,
}: {
  icon: typeof Heart;
  label: string;
  onPress: () => void;
  busy?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="size-11 items-center justify-center rounded-full active:bg-foreground/10"
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Icon as={icon} size={22} className="text-foreground" />
      )}
    </Pressable>
  );
}
