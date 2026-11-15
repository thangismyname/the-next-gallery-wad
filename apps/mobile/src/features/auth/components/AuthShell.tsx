import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppLogo } from "@/components/shared/AppLogo";
import { GalleryWall } from "@/components/shared/GalleryWall";
import { GlassBackButton } from "@/components/shared/GlassBackButton";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Text } from "@/components/ui/text";
import { useLayout } from "@/hooks/useLayout";
import { layoutGlide, riseIn } from "@/lib/motion";


/**
 * Auth layout: drifting photo-wall backdrop + a Liquid Glass card (brand, title,
 * description, form). Card width follows the window (`useLayout().formWidth`)
 * and stays centered on iPad / foldables / landscape; the page scrolls when the
 * keyboard or a short landscape screen needs it.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  showBack,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Glass back button top-left (pushed screens; swipe-back does the same). */
  showBack?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { formWidth, isTablet } = useLayout();
  return (
    <View className="flex-1 bg-background">
      <GalleryWall />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        {showBack ? <GlassBackButton /> : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="grow items-center justify-center"
          contentContainerStyle={{
            paddingTop: insets.top + (showBack ? 64 : 24),
            paddingBottom: insets.bottom + 24,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          }}
        >
          <View className="gap-5" style={{ width: formWidth }}>
            <GlassPanel radius={32} padding={isTablet ? 32 : 22}>
              <View className="gap-6">
                <View className="gap-3">
                  <View className="flex-row items-center gap-2">
                    <AppLogo size={24} />
                    <Text className="text-sm font-medium uppercase tracking-[3px] text-muted-foreground">
                      The Next Gallery
                    </Text>
                  </View>
                  {/* key = title → the new title / description rise in when the auth tab changes. */}
                  <Animated.View key={title} entering={riseIn} className="gap-2">
                    <Text role="heading" className="font-heading text-4xl font-semibold leading-tight">
                      {title}
                    </Text>
                    {description ? <Text className="text-base text-muted-foreground">{description}</Text> : null}
                  </Animated.View>
                </View>
                {children}
              </View>
            </GlassPanel>
            {footer ? (
              <Animated.View layout={layoutGlide} className="items-center">
                {footer}
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
