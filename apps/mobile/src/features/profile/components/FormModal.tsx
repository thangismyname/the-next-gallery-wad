import { router } from "expo-router";
import { X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

/**
 * Modal form shell: leading button (✕ = close by default) · title · primary
 * action, keyboard-aware scroll body (`scroll={false}` → the body manages its
 * own scrolling, e.g. a photo grid).
 */
export function FormModal({
  title,
  action,
  canSubmit,
  saving,
  onSubmit,
  leading,
  scroll = true,
  children,
}: {
  title: string;
  action: string;
  canSubmit: boolean;
  saving: boolean;
  onSubmit: () => void;
  leading?: { icon: LucideIcon; label: string; onPress: () => void };
  scroll?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const lead = leading ?? { icon: X, label: t("common.cancel"), onPress: () => router.back() };
  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Platform.OS === "ios" ? 16 : insets.top + 12 }}
      >
        <GlassButton size={40} accessibilityLabel={lead.label} onPress={lead.onPress}>
          <Icon as={lead.icon} size={20} />
        </GlassButton>
        <Text numberOfLines={1} className="flex-1 text-center text-[17px] font-semibold">
          {title}
        </Text>
        <Button size="sm" className="rounded-full px-4" disabled={!canSubmit || saving} onPress={onSubmit}>
          {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
          <Text>{action}</Text>
        </Button>
      </View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="gap-5 px-4 pt-2"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

export function FormLabel({ children }: { children: string }) {
  return <Text className="text-[14px] font-medium">{children}</Text>;
}
