import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";

import { GlassButton } from "./GlassButton";

/** Floating glass back button, top-left under the status bar. Default = `router.back()` (same as swipe-back). */
export function GlassBackButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { top, left } = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute z-10" style={{ top: top + 8, left: left + 16 }}>
      <GlassButton
        size={44}
        accessibilityLabel={t("common.back")}
        onPress={() => (onPress ? onPress() : router.canGoBack() && router.back())}
      >
        <Icon as={ChevronLeft} size={24} className="text-foreground" />
      </GlassButton>
    </View>
  );
}
