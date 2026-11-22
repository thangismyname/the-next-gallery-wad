import { getInitials, resolveMediaUrl } from "@tng/shared";
import { Portal } from "@rn-primitives/portal";
import { router } from "expo-router";
import {
  Camera,
  FileArchive,
  FolderOpen,
  FolderPlus,
  Images,
  LayoutPanelTop,
  Plus,
  Smartphone,
  Search,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppLogo } from "@/components/shared/AppLogo";
import { GlassButton } from "@/components/shared/GlassButton";
import { GlassMenu, type GlassMenuItem } from "@/components/shared/GlassMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSession } from "@/features/auth/session";
import { MomentReview } from "@/features/camera/components/MomentReview";
import type { MomentDraft } from "@/features/camera/useCameraCapture";
import { openMomentCamera, pickMomentDraft } from "@/features/moments/newMoment";
import { pickAndUpload, pickFilesAndUpload } from "@/features/upload/pickAndUpload";
import { layoutGlide } from "@/lib/motion";

import { HEADER_COLLAPSE_DISTANCE, HEADER_ROW, HEADER_TITLE_ROW } from "./layout";

const SIDE = 16;
const BUTTON = 40;
/** Title group size at the top relative to its collapsed size. */
const EXPANDED_SCALE = 1.3;


/** Screen-specific glass button shown under the avatar (e.g. Gallery sort) + its menu. */
export interface HeaderAction {
  icon: LucideIcon;
  label: string;
  /** Menu under the button (e.g. sort options)… */
  items?: GlassMenuItem[];
  /** …or a plain button (e.g. Moments bell → inbox). */
  onPress?: () => void;
  /** Count dot on the button (unread / pending). */
  badge?: number;
}

type OpenMenu = "add" | "action" | null;

/** Items of the "+" menu — each tab lists only what fits it (`add` prop). */
export type AddMenuKey =
  | "upload"
  | "files"
  | "takeout"
  | "camera"
  | "album"
  | "moment-camera"
  | "moment-multi"
  | "moment-account"
  | "moment-device";

/** Library tab (and the default): ways to add photos. */
export const LIBRARY_ADD: AddMenuKey[] = ["upload", "files", "camera", "takeout"];

/**
 * Transparent floating header for the tab screens (content scrolls under it).
 *
 * - Right: glass buttons Add · Search · Avatar; an optional screen `action`
 *   button sits under the avatar.
 * - Avatar → account sheet (`/account`: profile + settings, slides up).
 * - Menus are liquid-glass panels laid out in the right column (not overlays):
 *   opening the Add menu pushes the action button down below it. Tap outside (or
 *   the same button) to close.
 * - Top-left at the top of the page: "Hi, <name>". Scrolling fades it out and the
 *   logo + app name (big and centered on the second row at the top) shrinks into
 *   that spot (Google Photos style), driven by `scrollY` from `useHeaderScroll`.
 */
export function AppHeader({
  scrollY,
  title,
  action,
  add = LIBRARY_ADD,
}: {
  scrollY: SharedValue<number>;
  title?: string;
  action?: HeaderAction;
  /** What the "+" menu offers on this screen, in this order. */
  add?: AddMenuKey[];
}) {
  const { t } = useTranslation();
  const { top, left, right } = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [titleW, setTitleW] = useState(0);
  const [open, setOpen] = useState<OpenMenu>(null);
  const user = useSession().data?.user;

  const toggle = (menu: Exclude<OpenMenu, null>) => setOpen((current) => (current === menu ? null : menu));
  const close = () => setOpen(null);
  /** Close the menu, then run the item's action. */
  const pick = (fn: () => void) => () => {
    close();
    fn();
  };

  // Collapsed = left edge of the icon row, scale 1. Expanded = centered on the
  // row below, scaled up (scale is around the center → only the width matters).
  const dx = screenW / 2 - (SIDE + left + titleW / 2);
  const dy = HEADER_ROW / 2 + HEADER_TITLE_ROW / 2;
  const titleStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.get(), [0, HEADER_COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: titleW ? 1 : 0,
      transform: [
        { translateX: (1 - p) * dx },
        { translateY: (1 - p) * dy },
        { scale: EXPANDED_SCALE - (EXPANDED_SCALE - 1) * p },
      ],
    };
  }, [dx, dy, titleW]);

  // "Hi, <name>" in the title's collapsed spot at the top; fades out (and lifts a
  // little) during the first half of the collapse, before the logo slides in.
  const greetingStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.get(), [0, HEADER_COLLAPSE_DISTANCE / 2], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1 - p, transform: [{ translateY: -6 * p }] };
  });
  // Room left of the three icon buttons.
  const greetingMaxW = screenW - SIDE * 2 - left - right - (BUTTON * 3 + 10 * 2) - 12;

  // "Moment từ thư viện" → màn duyệt (khung + caption + Đăng) phủ cả tab bar.
  const [momentDraft, setMomentDraft] = useState<MomentDraft | null>(null);

  const allAddItems: (GlassMenuItem & { key: AddMenuKey })[] = [
    {
      key: "upload",
      label: t("upload.fromDevice"),
      icon: Images,
      onPress: pick(() => void pickAndUpload().catch(() => Alert.alert(t("upload.pickFailed")))),
    },
    {
      key: "files",
      label: t("upload.fromFiles"),
      icon: FolderOpen,
      onPress: pick(() => void pickFilesAndUpload().catch(() => Alert.alert(t("upload.pickFilesFailed")))),
    },
    { key: "takeout", label: t("takeout.menu"), icon: FileArchive, onPress: pick(() => router.push("/import-takeout")) },
    { key: "camera", label: t("upload.takePhoto"), icon: Camera, onPress: pick(() => router.navigate("/camera")) },
    { key: "moment-camera", label: t("camera.momentsMode"), icon: Camera, onPress: pick(openMomentCamera) },
    {
      key: "moment-multi",
      label: t("moments.multiMenu"),
      icon: LayoutPanelTop,
      onPress: pick(() => router.push("/moment-create")),
    },
    {
      key: "moment-account",
      label: t("moments.fromAccountMenu"),
      icon: Images,
      onPress: pick(() => router.push("/moment-library")),
    },
    {
      key: "moment-device",
      label: t("moments.fromDeviceMenu"),
      icon: Smartphone,
      onPress: pick(() => void pickMomentDraft().then((d) => d && setMomentDraft(d))),
    },
    {
      key: "album",
      label: t("albums.newAlbum"),
      icon: FolderPlus,
      onPress: pick(() => router.push("/album-form")),
    },
  ];
  const addItems = add.flatMap((key) => allAddItems.filter((item) => item.key === key));

  const avatar = (size: number, textClass: string) => (
    <Avatar alt={user?.name ?? ""} style={{ width: size, height: size }}>
      {user?.image ? <AvatarImage source={{ uri: resolveMediaUrl(user.image) }} /> : null}
      <AvatarFallback>
        <Text className={textClass}>{getInitials(user?.name)}</Text>
      </AvatarFallback>
    </Avatar>
  );

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-10"
      style={{ paddingTop: top, paddingLeft: left, paddingRight: right }}
    >
      {/* Tap anywhere outside an open menu to close it. */}
      {open ? (
        <Pressable
          accessibilityLabel={t("common.cancel")}
          onPress={close}
          className="absolute left-0 top-0"
          style={{ width: screenW, height: screenH }}
        />
      ) : null}

      <View pointerEvents="box-none" className="flex-row items-center justify-end gap-2.5 px-4" style={{ height: HEADER_ROW }}>
        {user?.name ? (
          <Animated.View
            pointerEvents="none"
            className="absolute"
            style={[{ left: SIDE, maxWidth: greetingMaxW }, greetingStyle]}
          >
            <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
              {t("header.greeting")}
            </Text>
            <Text numberOfLines={1} className="text-[17px] font-semibold leading-tight">
              {user.name}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View
          pointerEvents="none"
          onLayout={(e) => setTitleW(e.nativeEvent.layout.width)}
          className="absolute flex-row items-center gap-2"
          style={[{ left: SIDE }, titleStyle]}
        >
          <AppLogo size={26} />
          <Text numberOfLines={1} className="font-heading text-xl font-semibold">
            {title ?? t("app.name")}
          </Text>
        </Animated.View>

        <GlassButton
          size={BUTTON}
          accessibilityLabel={t("gallery.upload.button")}
          accessibilityState={{ expanded: open === "add" }}
          onPress={() => toggle("add")}
        >
          <Icon as={Plus} size={20} />
        </GlassButton>
        <GlassButton
          size={BUTTON}
          accessibilityLabel={t("header.search")}
          onPress={() => {
            close();
            router.push("/search");
          }}
        >
          <Icon as={Search} size={19} />
        </GlassButton>
        <GlassButton
          size={BUTTON}
          accessibilityLabel={t("header.account")}
          onPress={() => {
            close();
            // Account + settings live in a sheet that slides up (Google Photos style).
            router.push("/account");
          }}
        >
          {avatar(34, "text-sm font-semibold")}
        </GlassButton>
      </View>

      {/* Right column: open menu → action button (pushed down) → its menu. */}
      <View
        pointerEvents="box-none"
        className="items-end gap-2.5 px-4"
        style={{ paddingTop: (HEADER_TITLE_ROW - BUTTON) / 2 - 2 }}
      >
        {open === "add" ? <GlassMenu items={addItems} width={230} /> : null}
        {action ? (
          <Animated.View layout={layoutGlide}>
            <GlassButton
              size={BUTTON}
              accessibilityLabel={action.label}
              accessibilityState={action.items ? { expanded: open === "action" } : undefined}
              onPress={() => {
                if (action.items) return toggle("action");
                setOpen(null);
                action.onPress?.();
              }}
            >
              <Icon as={action.icon} size={19} />
            </GlassButton>
            {action.badge ? (
              <View pointerEvents="none" className="absolute -right-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1">
                <Text className="text-[10px] font-semibold text-primary-foreground">{action.badge > 99 ? "99+" : action.badge}</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
        {action?.items && open === "action" ? (
          <GlassMenu
            width={230}
            items={action.items.map((item) => ({ ...item, onPress: pick(item.onPress) }))}
          />
        ) : null}
      </View>
      {momentDraft ? (
        <Portal name="moment-review">
          <MomentReview draft={momentDraft} onClose={() => setMomentDraft(null)} onPosted={() => setMomentDraft(null)} />
        </Portal>
      ) : null}
    </View>
  );
}
