import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type TextInput } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Input with a show / hide toggle (like web `PasswordInput`). */
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input> & React.RefAttributes<TextInput>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <View className="relative justify-center">
      <Input
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        className={cn("pr-11", className)}
        {...props}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(visible ? "auth.hidePassword" : "auth.showPassword")}
        className="absolute right-0 h-full w-11 items-center justify-center active:opacity-60"
      >
        <Icon as={visible ? EyeOff : Eye} size={18} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}
