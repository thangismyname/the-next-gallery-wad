import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { signUpWithEmail } from "../authActions";
import { signUpSchema, type SignUpValues } from "../authSchemas";
import { FormError } from "./FormError";
import { FormField } from "./FormField";
import { SwitchPrompt } from "./SwitchPrompt";

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, setFocus, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const busy = formState.isSubmitting;

  // Better Auth signs the new user in right away → the root guard opens the app.
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setError(await signUpWithEmail(values));
  });

  return (
    <View className="gap-4">
      <FormField
        control={control}
        name="name"
        label={t("auth.name")}
        placeholder={t("auth.namePlaceholder")}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => setFocus("email")}
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => setFocus("confirmPassword")}
      />
      <FormField
        control={control}
        name="confirmPassword"
        password
        label={t("auth.confirmPassword")}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void onSubmit()}
      />
      <FormError messageKey={error} />
      <Button size="lg" className="mt-2 h-12" disabled={busy} onPress={() => void onSubmit()}>
        <Text className="text-base">{busy ? t("auth.registering") : t("auth.register")}</Text>
      </Button>
      <SwitchPrompt prompt={t("auth.alreadyHaveAccount")} action={t("auth.login")} onPress={onSwitchToLogin} />
    </View>
  );
}
