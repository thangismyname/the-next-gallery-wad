import * as Haptics from "expo-haptics";
import { Check, ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { fadeIn, menuIn, menuOut } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { GlassPanel } from "./GlassPanel";

export interface GlassMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Custom leading element instead of `icon` (e.g. a label color dot). */
  leading?: ReactNode;
  /** Opens a sub-page (shows a chevron). */
  chevron?: boolean;
  /** Spinner instead of the trailing check / chevron. */
  busy?: boolean;
  /** Shows a check mark (single-choice menus, e.g. sort). */
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}

const RADIUS = 22;

/**
 * Liquid-glass menu panel. Rendered **in the layout** (not a portal overlay), so
 * whatever sits below it in the same column is pushed down — give those siblings
 * `layout={layoutGlide}`. Opens from `origin` (the button's corner) with `menuIn`.
 */
export function GlassMenu({
  items,
  header,
  width = 260,
  origin = "top right",
  contentKey,
  maxHeight,
}: {
  items: GlassMenuItem[];
  /** Optional block above the items (e.g. account name + email). */
  header?: ReactNode;
  width?: number;
  origin?: "top right" | "top left" | "bottom right";
  /** Change it to swap the menu's page: the content fades in again, the glass stays. */
  contentKey?: string;
  /** Items scroll inside the panel past this height. */
  maxHeight?: number;
}) {
  return (
    <Animated.View
      entering={menuIn}
      exiting={menuOut}
      className="shadow-xl shadow-black/25"
      style={{ width, transformOrigin: origin }}
    >
      <GlassPanel radius={RADIUS} materialize>
        {/* Content fades inside the glass (fading the glass itself would break it). */}
        <Animated.View key={contentKey} entering={fadeIn}>
          {header ? (
            <>
              {header}
              <View className="mx-2 my-1 h-px bg-foreground/10" />
            </>
          ) : null}
          <ScrollView style={maxHeight ? { maxHeight } : undefined} scrollEnabled={!!maxHeight} bounces={false}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="menuitem"
                accessibilityState={item.selected != null ? { checked: item.selected } : undefined}
                onPress={() => {
                  if (Platform.OS !== "web") void Haptics.selectionAsync();
                  item.onPress();
                }}
                className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-foreground/10"
              >
                {item.leading ??
                  (item.icon ? (
                    <Icon as={item.icon} size={20} className={item.destructive ? "text-destructive" : "text-foreground"} />
                  ) : null)}
                <Text numberOfLines={1} className={cn("flex-1 text-base", item.destructive && "text-destructive")}>
                  {item.label}
                </Text>
                {item.busy ? (
                  <ActivityIndicator size="small" />
                ) : item.selected ? (
                  <Icon as={Check} size={18} className="text-foreground" />
                ) : item.chevron ? (
                  <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </GlassPanel>
    </Animated.View>
  );
}
