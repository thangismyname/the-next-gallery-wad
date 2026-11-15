import { useQueryClient } from "@tanstack/react-query";
import { adminQueryKeys } from "@tng/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassBackButton } from "@/components/shared/GlassBackButton";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";
import { fadeIn } from "@/lib/motion";
import { SEGMENT_SHADOW, cn } from "@/lib/utils";

import { DeveloperTab } from "./components/DeveloperTab";
import { OverviewTab } from "./components/OverviewTab";
import { UsersTab } from "./components/UsersTab";
import { useAdminDeveloperRequests } from "./useAdmin";

type Tab = "overview" | "users" | "developer";
const BAR = 44;

/**
 * Admin (route `/admin`, pushed from the account sheet — admins only; the API is
 * `requireAdmin` anyway). The web admin's 3 pages as tabs: Overview (web
 * `AdminDashboard`) · Users (`AdminUsersView`) · Developer requests
 * (`AdminDeveloperView`, pending count badge = web sidebar badge). `?tab=` opens a tab.
 */
export function AdminScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { formWidth, isTablet } = useLayout();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "users" || params.tab === "developer" ? params.tab : "overview");
  const [refreshing, setRefreshing] = useState(false);
  const pending = useAdminDeveloperRequests().requests.filter((r) => r.status === "pending").length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
    } finally {
      setRefreshing(false);
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: t("admin.nav.dashboard") },
    { key: "users", label: t("admin.nav.users") },
    { key: "developer", label: t("admin.nav.developer"), count: pending },
  ];

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} progressViewOffset={insets.top + BAR} />}
        contentContainerStyle={{
          paddingTop: insets.top + 8 + BAR + 12,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
          alignItems: "center",
        }}
      >
        {/* Wider than a form on tablets — the admin has grids + a chart. */}
        <View style={{ width: isTablet ? 720 : formWidth, maxWidth: "100%" }} className="gap-5">
          <View className="gap-1">
            <Text className="font-heading text-3xl font-semibold">{t("header.admin")}</Text>
            <Text className="text-[15px] text-muted-foreground">{t("admin.overviewDesc")}</Text>
          </View>

          <View className="flex-row rounded-full bg-muted p-1">
            {tabs.map((item) => {
              const active = item.key === tab;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(item.key)}
                  className={cn("h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-1", active && "bg-background")}
                  style={active ? SEGMENT_SHADOW : undefined}
                >
                  <Text numberOfLines={1} className={cn("shrink text-[13px] font-semibold", !active && "text-muted-foreground")}>
                    {item.label}
                  </Text>
                  {item.count ? (
                    <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
                      <Text className="text-[11px] font-semibold tabular-nums text-primary-foreground">{item.count}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Animated.View key={tab} entering={fadeIn}>
            {tab === "overview" ? <OverviewTab onTab={setTab} /> : tab === "users" ? <UsersTab /> : <DeveloperTab />}
          </Animated.View>
        </View>
      </ScrollView>

      <GlassBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </KeyboardAvoidingView>
  );
}
