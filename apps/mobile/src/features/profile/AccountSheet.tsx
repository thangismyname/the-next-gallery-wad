import { LANGUAGES, toLanguageCode, type LanguageCode } from "@tng/shared";
import { router } from "expo-router";
import { KeyRound, Languages, LogOut, Palette, ShieldCheck, UserRound, Users, X } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppLogo } from "@/components/shared/AppLogo";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { signOut, useSession } from "@/features/auth/session";
import { useIncomingRequestCount } from "@/features/friends/useFriends";
import { THEME_MODES, useThemeMode } from "@/hooks/useThemeMode";
import { setLanguage } from "@/lib/i18n";

import { AiProcessingGroup } from "./components/AiProcessingGroup";
import { DeveloperGroup } from "./components/DeveloperGroup";
import { ProfileSummary } from "./components/ProfileSummary";
import { SessionsGroup } from "./components/SessionsGroup";
import { Segmented, SettingsGroup, SettingsRow } from "./components/SettingsGroup";
import { StorageGroup } from "./components/StorageGroup";
import { useAccountProviders } from "./useProfile";

/**
 * Account sheet (Google Photos style) — tap the avatar → native form sheet that
 * slides up (`/account`, detents 65 % / full, grabber). Profile + settings in one
 * place (web `ProfileView` + `SettingsView`): account card + stats · account
 * (edit profile, change password) · appearance (theme, language) · storage +
 * trash · AI processing · signed-in devices · sign out.
 */
export function AccountSheet() {
  const { t, i18n } = useTranslation();
  const incoming = useIncomingRequestCount();
  const insets = useSafeAreaInsets();
  const user = useSession().data?.user;
  const { data: providers = [] } = useAccountProviders(user?.id);
  const mode = useThemeMode((s) => s.mode);
  const setMode = useThemeMode((s) => s.setMode);
  const hasPassword = providers.includes("credential");

  return (
    // The ScrollView is the sheet's root: a native form sheet lays its first scroll view over
    // the whole sheet, so a title bar placed beside it got covered. The bar is a sticky header.
    <ScrollView
      className="flex-1 bg-background"
      stickyHeaderIndices={[0]}
      contentContainerClassName="gap-6"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center bg-background px-4 pb-2 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          hitSlop={8}
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-full bg-muted active:opacity-70"
        >
          <Icon as={X} size={18} />
        </Pressable>
        <View className="flex-1 flex-row items-center justify-center gap-2 pr-9">
          <AppLogo size={22} />
          <Text className="font-heading text-[17px] font-semibold">{t("app.name")}</Text>
        </View>
      </View>

        {user ? <ProfileSummary user={user} providers={providers} /> : <Skeleton className="mx-4 h-24 rounded-3xl" />}

        {/* Rows leave the sheet first (`replace`): a screen opened on top of a native form
            sheet can end up behind it (Android shows the sheet as its own dialog). */}
        <SettingsGroup
          title={t("header.account")}
          footer={!hasPassword && providers.length ? t("profile.noPassword") : undefined}
        >
          <SettingsRow
            icon={UserRound}
            title={t("profile.infoTitle")}
            subtitle={t("profile.infoDesc")}
            chevron
            onPress={() => router.replace("/profile-edit")}
          />
          <SettingsRow
            icon={Users}
            title={t("friends.title")}
            subtitle={incoming ? t("friends.toastRequestTitle") : t("friends.subtitle")}
            trailing={
              incoming ? (
                <View className="min-w-6 items-center rounded-full bg-primary px-2 py-0.5">
                  <Text className="text-[12px] font-semibold tabular-nums text-primary-foreground">{incoming}</Text>
                </View>
              ) : undefined
            }
            chevron
            onPress={() => router.replace("/friends")}
          />
          {hasPassword ? (
            <SettingsRow
              icon={KeyRound}
              title={t("profile.passwordTitle")}
              chevron
              onPress={() => router.replace("/change-password")}
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title={t("settings.appearance.title")}>
          <SettingsRow icon={Palette} title={t("settings.appearance.theme")}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={THEME_MODES.map((m) => ({ value: m, label: t(`settings.appearance.${m}`) }))}
            />
          </SettingsRow>
          <SettingsRow icon={Languages} title={t("settings.appearance.language")}>
            <Segmented<LanguageCode>
              value={toLanguageCode(i18n.language)}
              onChange={setLanguage}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
          </SettingsRow>
        </SettingsGroup>

        <StorageGroup />
        <AiProcessingGroup />
        <DeveloperGroup />
        {(user as { role?: string | null } | undefined)?.role === "admin" ? (
          <SettingsGroup>
            <SettingsRow icon={ShieldCheck} title={t("header.admin")} subtitle={t("admin.overviewDesc")} chevron onPress={() => router.replace("/admin")} />
          </SettingsGroup>
        ) : null}
        <SessionsGroup />

        <SettingsGroup>
          <SettingsRow icon={LogOut} title={t("header.logout")} destructive onPress={() => void signOut()} />
        </SettingsGroup>
    </ScrollView>
  );
}
