import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

import { signInWithProvider, type SocialProvider } from "../authActions";
import { GithubIcon, GoogleIcon } from "./BrandIcons";
import { FormError } from "./FormError";

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "github", label: "GitHub", Icon: GithubIcon },
] as const satisfies readonly { id: SocialProvider; label: string; Icon: unknown }[];

/** "Or continue with" + Google / GitHub (Better Auth social sign-in via deep link). */
export function OAuthButtons({ disabled }: { disabled?: boolean } = {}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<{ key: string; provider: string } | null>(null);

  const onPress = async (id: SocialProvider, label: string) => {
    setError(null);
    setPending(id);
    const key = await signInWithProvider(id);
    setPending(null);
    if (key) setError({ key, provider: label });
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Separator className="flex-1" />
        <Text className="text-sm text-muted-foreground">{t("auth.orContinueWith")}</Text>
        <Separator className="flex-1" />
      </View>
      <FormError messageKey={error?.key ?? null} values={error ? { provider: error.provider } : undefined} />
      <View className="flex-row gap-3">
        {PROVIDERS.map(({ id, label, Icon }) => (
          <Button
            key={id}
            variant="outline"
            className="h-12 flex-1 border-foreground/10 bg-background/50 dark:bg-background/30"
            disabled={disabled || pending !== null}
            onPress={() => void onPress(id, label)}
          >
            <Icon color={colors.foreground} />
            <Text className="text-base">{pending === id ? t("auth.connecting") : label}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}
