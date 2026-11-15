import { Search, X } from "lucide-react-native";
import type { ComponentRef, Ref } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { GlassPanel } from "@/components/shared/GlassPanel";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";

/** Glass pill search input: 🔍 · text · spinner while searching / ✕ to clear. */
export function SearchField({
  value,
  onChange,
  onSubmit,
  pending,
  ref,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  pending: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View className="flex-1">
      <GlassPanel radius={999} padding={0}>
        <View className="h-11 flex-row items-center gap-2 pl-3.5 pr-1.5">
          <Icon as={Search} size={18} className="text-muted-foreground" />
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChange}
            onSubmitEditing={onSubmit}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t("header.search")}
            className="h-full flex-1 font-sans text-[17px] text-foreground"
          />
          {pending ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} className="mr-2" />
          ) : value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={8}
              onPress={() => onChange("")}
              className="size-8 items-center justify-center rounded-full active:bg-foreground/10"
            >
              <Icon as={X} size={17} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>
      </GlassPanel>
    </View>
  );
}
