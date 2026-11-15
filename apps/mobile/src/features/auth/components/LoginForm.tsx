import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "expo-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { signInWithEmail } from "../authActions";
import { signInSchema, type SignInValues } from "../authSchemas";
import { FormError } from "./FormError";
import { FormField } from "./FormField";
import { SwitchPrompt } from "./SwitchPrompt";

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, setFocus, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const busy = formState.isSubmitting;

  // On success the session store updates and the root guard opens the app.
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setError(await signInWithEmail(values));
  });

  return (
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
        returnKeyType="next"
        onSubmitEditing={() => setFocus("password")}
      />
      <FormField
        control={control}
        name="password"
        password
        label={t("auth.password")}
        labelRight={
          <Link href="/forgot-password">
            <Text className="text-[15px] text-muted-foreground underline">{t("auth.forgotPassword")}</Text>
          </Link>
        }
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void onSubmit()}
      />
      <FormError messageKey={error} />
      <Button size="lg" className="mt-2 h-12" disabled={busy} onPress={() => void onSubmit()}>
        <Text className="text-base">{busy ? t("auth.loggingIn") : t("auth.login")}</Text>
      </Button>
      <SwitchPrompt prompt={t("auth.noAccount")} action={t("auth.signUp")} onPress={onSwitchToRegister} />
    </View>
  );
}
