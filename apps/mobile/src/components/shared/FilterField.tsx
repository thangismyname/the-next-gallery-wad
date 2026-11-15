import { Search, X } from "lucide-react-native";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/**
 * List filter box used across screens (Spotlight has its own glass `features/search/components/SearchField`): muted pill · search icon · input ·
 * ✕ clears when there is text. `className` styles the box (height, radius, margins).
 */
export function FilterField({
  value,
  onChangeText,
  className,
  ...props
}: Omit<TextInputProps, "value" | "onChangeText" | "className"> & {
  value: string;
  onChangeText: (text: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View className={cn("h-11 flex-row items-center gap-2 rounded-2xl bg-muted px-3.5", className)}>
      <Icon as={Search} size={16} className="text-muted-foreground" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
        placeholderTextColor={colors.mutedForeground}
        className="h-full flex-1 font-sans text-[15px] text-foreground"
        {...props}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} onPress={() => onChangeText("")}>
          <Icon as={X} size={16} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
