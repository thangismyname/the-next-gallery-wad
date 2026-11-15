import { router } from "expo-router";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/text";
import { PasswordInput } from "@/features/auth/components/PasswordInput";
import { authClient } from "@/lib/authClient";

import { FormLabel, FormModal } from "./components/FormModal";

const MIN_LENGTH = 8;

/** Change password (web `ChangePasswordForm`, Better Auth `changePassword`), modal `/change-password`. */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = !!current && next.length >= MIN_LENGTH && next === confirm;

  const submit = async () => {
    setSaving(true);
    setError(null);
    const { error: failed } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOthers,
    });
    setSaving(false);
    if (failed) return setError(t("profile.passwordFailed"));
    Alert.alert(t("profile.passwordChanged"));
    router.back();
  };

  return (
    <FormModal
      title={t("profile.passwordTitle")}
      action={t("profile.changePassword")}
      canSubmit={canSubmit}
      saving={saving}
      onSubmit={() => void submit()}
    >
      <Text className="text-[14px] text-muted-foreground">{t("profile.passwordDesc")}</Text>
      <View className="gap-2">
        <FormLabel>{t("profile.currentPassword")}</FormLabel>
        <PasswordInput value={current} onChangeText={setCurrent} autoComplete="current-password" className="h-12 rounded-2xl text-[16px]" />
      </View>
      <View className="gap-2">
        <FormLabel>{t("auth.newPassword")}</FormLabel>
        <PasswordInput value={next} onChangeText={setNext} autoComplete="new-password" className="h-12 rounded-2xl text-[16px]" />
        {tooShort ? <Text className="text-[13px] text-destructive">{t("auth.passwordTooShort")}</Text> : null}
      </View>
      <View className="gap-2">
        <FormLabel>{t("auth.confirmPassword")}</FormLabel>
        <PasswordInput value={confirm} onChangeText={setConfirm} autoComplete="new-password" className="h-12 rounded-2xl text-[16px]" />
        {mismatch ? <Text className="text-[13px] text-destructive">{t("auth.passwordMismatch")}</Text> : null}
      </View>
      <View className="flex-row items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3">
        <Text className="flex-1 text-[15px]">{t("profile.revokeOthers")}</Text>
        <Switch value={revokeOthers} onValueChange={setRevokeOthers} />
      </View>
      {error ? <Text className="text-[14px] text-destructive">{error}</Text> : null}
    </FormModal>
  );
}
