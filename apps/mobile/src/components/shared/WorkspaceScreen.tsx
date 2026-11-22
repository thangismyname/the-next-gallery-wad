import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassBackButton } from "@/components/shared/GlassBackButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { tabBarSpace } from "@/features/navigation/layout";
import { nextTabBarHidden, setTabBarHidden, useTabBarScroll } from "@/features/navigation/tabBarScroll";
import { useLayout } from "@/hooks/useLayout";

const BAR = 44;

/** Back from a workspace tab root: the workspace tabs use `backBehavior="none"`, so this pops the whole
 *  Admin / Developer workspace off the root stack (opened with `replace` from the account sheet → `/`). */
export const exitWorkspace = () => (router.canGoBack() ? router.back() : router.replace("/"));

/**
 * One page of the Admin / Developer workspace (screens inside their `NativeTabs`): glass back button ·
 * title + subtitle · scroll content (≤ 960pt, centered; pads for the native tab bar) · pull-to-refresh
 * that invalidates `refreshKey`. `keyboard` = pages with a search field.
 */
export function WorkspaceScreen({
  title,
  subtitle,
  refreshKey,
  onBack = exitWorkspace,
  keyboard,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  refreshKey: QueryKey;
  onBack?: () => void;
  keyboard?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Tab bar hides while scrolling down (same rule as useHeaderScroll), visible again on focus.
  const lastY = useRef(0);
  useFocusEffect(useCallback(() => setTabBarHidden(false), []));

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: refreshKey });
    } finally {
      setRefreshing(false);
    }
  };

  const scroll = (
    <ScrollView
      scrollEventThrottle={16}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        setTabBarHidden(nextTabBarHidden(y, y - lastY.current, useTabBarScroll.getState().hidden));
        lastY.current = y;
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} progressViewOffset={insets.top + BAR} />}
      contentContainerStyle={{
        paddingTop: insets.top + 8 + BAR + 12,
        paddingBottom: tabBarSpace(insets.bottom) + 16,
        paddingLeft: insets.left + 16,
        paddingRight: insets.right + 16,
        alignItems: "center",
      }}
    >
      {/* Theo bề rộng cửa sổ (≤ 960): xoay ngang, iPad split view, màn trong iPhone Duo dùng hết chỗ. */}
      <View style={{ width: Math.min(960, width - 32 - insets.left - insets.right) }} className="gap-5">
        <View className="gap-1">
          {typeof title === "string" ? <Text className="font-heading text-3xl font-semibold">{title}</Text> : title}
          {subtitle ? <Text className="text-[15px] text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );

  return (
    <View className="flex-1 bg-background">
      {keyboard ? (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {scroll}
        </KeyboardAvoidingView>
      ) : (
        scroll
      )}
      <GlassBackButton onPress={onBack} />
    </View>
  );
}

/** Nút sang workspace kia (Admin ↔ Developer), đặt trong trang Tổng quan — web: nút đáy sidebar. */
export function WorkspaceSwitchButton({ to, icon, label }: { to: "/admin" | "/dev"; icon: LucideIcon; label: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.replace(to)}
      className="flex-row items-center gap-2 self-start rounded-full border border-border px-3.5 py-2 active:bg-muted"
    >
      <Icon as={icon} size={16} className="text-foreground" />
      <Text className="text-[13px] font-semibold">{label}</Text>
    </Pressable>
  );
}
