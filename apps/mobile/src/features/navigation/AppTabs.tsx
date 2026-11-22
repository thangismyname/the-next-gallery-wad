import { Tabs } from "expo-router";
import { NativeTabs, type MaterialIcon, type SFSymbolIcon } from "expo-router/native-tabs";
import type { LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useTheme } from "@/hooks/useTheme";

import { BottomBar } from "./BottomBar";
import { NATIVE_TAB_BAR } from "./layout";
import { useTabBarScroll } from "./tabBarScroll";

export interface AppTab {
  /** Route name inside the layout. */
  name: string;
  /** Accessibility label (icons only). */
  labelKey: string;
  /** Plan A icons: iOS SF Symbol (outline — lighter strokes) / Android Material Symbol. */
  sf: SFSymbolIcon["sf"];
  md: MaterialIcon["md"];
  /** Plan B icon. */
  icon: LucideIcon;
  /** Count shown only when > 0. */
  badge?: number;
}

/**
 * Tab navigator of the app, the Admin and the Developer workspace — plan A (system `NativeTabs`) or plan B
 * (custom glass `BottomBar`), switched by `NATIVE_TAB_BAR` in `layout.ts`. `hidden` = selection mode (the
 * screen's own SelectionBar takes the spot). Scroll down: A = iOS minimize / Android hides; B = shrinks.
 * Each screen pads its content for the bar itself (`tabBarSpace`).
 */
export function AppTabs({ tabs, hidden = false, backBehavior }: { tabs: AppTab[]; hidden?: boolean; backBehavior?: "none" }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scrollHidden = useTabBarScroll((s) => s.hidden);

  if (!NATIVE_TAB_BAR) {
    return (
      <Tabs
        backBehavior={backBehavior}
        tabBar={(props) => <BottomBar {...props} tabs={tabs} hidden={hidden} />}
        // No navigator animation: it fades the whole scene, which breaks the header's Liquid Glass.
        screenOptions={{ headerShown: false, animation: "none" }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} />
        ))}
      </Tabs>
    );
  }

  return (
    <NativeTabs
      backBehavior={backBehavior}
      // Android has no minimize → hides on scroll down instead.
      hidden={hidden || (Platform.OS === "android" && scrollHidden)}
      minimizeBehavior="onScrollDown"
      sidebarAdaptable
      tintColor={colors.foreground}
    >
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name} disableAutomaticContentInsets accessibilityLabel={t(tab.labelKey)}>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
          <NativeTabs.Trigger.Label hidden />
          {/* `Badge hidden` still draws "0" → only rendered when there is something */}
          {tab.badge ? <NativeTabs.Trigger.Badge>{String(tab.badge)}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
