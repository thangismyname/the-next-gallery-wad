import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { riseIn } from "@/lib/motion";

import { requestPasswordReset } from "./authActions";
import { forgotPasswordSchema, type ForgotPasswordValues } from "./authSchemas";
import { AuthShell } from "./components/AuthShell";
import { FormError } from "./components/FormError";
import { FormField } from "./components/FormField";

/** Sends the reset email; the link opens the web reset page (`WEB_URL/reset-password`). */
export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const busy = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const key = await requestPasswordReset(values);
    if (key) setError(key);
    else setSentTo(values.email);
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/auth"));

  return (
    <AuthShell
      title={t("auth.forgotPasswordTitle")}
      description={sentTo ? undefined : t("auth.forgotPasswordDescription")}
      showBack
      footer={
        <Button variant="link" onPress={back}>
          <Text className="text-[15px]">{t("auth.backToLogin")}</Text>
        </Button>
      }
    >
      {sentTo ? (
        <Animated.View entering={riseIn} className="items-center gap-4 rounded-2xl bg-foreground/5 p-6">
          <Icon as={MailCheck} size={32} />
          <Text className="text-center text-base">{t("auth.forgotPasswordSent", { email: sentTo })}</Text>
        </Animated.View>
      ) : (
        <View className="gap-4">
          <FormField
            control={control}
            name="email"
            label={t("auth.email")}
            placeholder={t("auth.emailPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => void onSubmit()}
          />
          <FormError messageKey={error} />
          <Button size="lg" className="mt-2 h-12" disabled={busy} onPress={() => void onSubmit()}>
            <Text className="text-base">{busy ? t("auth.sending") : t("auth.sendResetLink")}</Text>
          </Button>
        </View>
      )}
    </AuthShell>
  );
}
