import { LANGUAGES, toLanguageCode } from "@tng/shared";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Text } from "@/components/ui/text";
import { setLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** VI · EN · JA chips on a glass pill (same choices as the web auth card). */
export function LanguageSwitch() {
  const { i18n } = useTranslation();
  const current = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  return (
    <GlassPanel radius={999} padding={4}>
    <View className="flex-row gap-1">
      {LANGUAGES.map((lang) => {
        const active = current === lang.code;
        return (
          <Pressable
            key={lang.code}
            onPress={() => setLanguage(lang.code)}
            accessibilityRole="button"
            accessibilityLabel={lang.label}
            accessibilityState={{ selected: active }}
            className={cn("rounded-full px-3.5 py-1.5 active:opacity-70", active && "bg-primary")}
          >
            <Text className={cn("text-sm font-medium", active ? "text-primary-foreground" : "text-muted-foreground")}>
              {lang.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
    </GlassPanel>
  );
}
