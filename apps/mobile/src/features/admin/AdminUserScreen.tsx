import { formatBytes, formatDate, formatRelative, parseUserAgent, userKind } from "@tng/shared";
import { router, useLocalSearchParams } from "expo-router";
import {
  Archive,
  Ban,
  CalendarDays,
  Clock,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Monitor,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassBackButton } from "@/components/shared/GlassBackButton";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useSession } from "@/features/auth/session";
import { SettingsGroup, SettingsRow } from "@/features/profile/components/SettingsGroup";
import { useLayout } from "@/hooks/useLayout";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

import { AdminBadge, AdminStatGrid, AiCoverageBars, KindChip, SECTION_LABEL, UserCell } from "./components/AdminUi";
import { bannedBadge } from "./components/UsersTab";
import { useAdminUserActions, useAdminUserDetail, useAdminUserSessions, type AdminUserAction } from "./useAdmin";

const BAR = 44;

/**
 * One user (route `/admin-user?id=`, web `AdminUserSheet` + `AdminUserActions`):
 * profile + badges · stats · AI progress · sessions (revoke one) · actions: role,
 * sign out everywhere, ban (with reason) / unban, delete (confirmed). No actions on yourself.
 */
export function AdminUserScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { formWidth } = useLayout();
  const { id = "" } = useLocalSearchParams<{ id?: string }>();
  const me = useSession().data?.user.id;
  const detail = useAdminUserDetail(id);
  const sessions = useAdminUserSessions(id);
  const user = detail.data?.user;
  const stats = detail.data?.stats;
  const { action, revokeSession } = useAdminUserActions(user);
  const [banning, setBanning] = useState(false);
  const [reason, setReason] = useState("");
  const name = user ? user.name || user.email : "";

  const run = (kind: AdminUserAction, extra?: { reason?: string }) =>
    action.mutate(
      { kind, ...extra },
      {
        onSuccess: () => {
          setBanning(false);
          setReason("");
          if (kind === "delete") router.back();
        },
        onError: (e) => Alert.alert(t("lightbox.actionFailed"), (e as Error).message),
      },
    );
  const confirmDelete = () =>
    Alert.alert(t("admin.action.deleteTitle"), t("admin.action.deleteConfirm", { name, n: user?.mediaCount ?? 0 }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("admin.action.delete"), style: "destructive", onPress: () => run("delete") },
    ]);
  const busy = (kind: AdminUserAction) => action.isPending && action.variables?.kind === kind;

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 8 + BAR + 12,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          alignItems: "center",
        }}
      >
        <View style={{ width: formWidth + 32, maxWidth: "100%" }} className="gap-6">
          {/* Profile */}
          <View className="gap-3 px-4">
            {user ? (
              <>
                <UserCell name={user.name} email={user.email} image={user.image} />
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <KindChip kind={userKind(user)} />
                  {bannedBadge(user, t)}
                  <AdminBadge label={user.emailVerified ? t("profile.verified") : t("profile.unverified")} variant="outline" />
                  {user.id === me ? <Text className="ml-auto text-[12px] text-muted-foreground">{t("admin.you")}</Text> : null}
                </View>
                {user.banned && user.banReason ? (
                  <Text className="rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                    {t("admin.detail.banReason", { reason: user.banReason })}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <View className="flex-row items-center gap-1.5">
                    <Icon as={CalendarDays} size={14} className="text-muted-foreground" />
                    <Text className="text-[12px] text-muted-foreground">
                      {t("admin.detail.joined", { date: formatDate(user.createdAt, i18n.language) })}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Icon as={Clock} size={14} className="text-muted-foreground" />
                    <Text className="text-[12px] text-muted-foreground">
                      {t("admin.detail.lastActive", { time: formatRelative(user.lastActiveAt, i18n.language) })}
                    </Text>
                  </View>
                </View>
              </>
            ) : detail.isError ? (
              <Text className="text-[14px] text-destructive">{t("admin.error.loadFailed")}</Text>
            ) : (
              <Skeleton className="h-24 rounded-2xl" />
            )}
          </View>

          {stats ? (
            <>
              <View className="px-4">
                <AdminStatGrid
                  cols={3}
                  stats={[
                    { key: "photos", icon: ImageIcon, label: t("admin.kpi.photos"), value: stats.photos },
                    { key: "videos", icon: Film, label: t("admin.kpi.videos"), value: stats.videos },
                    { key: "storage", icon: HardDrive, label: t("admin.kpi.storage"), value: formatBytes(stats.storageBytes) },
                    { key: "albums", icon: FolderOpen, label: t("admin.detail.albums"), value: stats.albums },
                    { key: "moments", icon: Sparkles, label: t("admin.detail.moments"), value: stats.moments },
                    { key: "trashed", icon: Archive, label: t("admin.detail.trashed"), value: stats.trashed },
                  ]}
                />
              </View>
              <View className="gap-3 px-4">
                <Text className={SECTION_LABEL}>{t("admin.detail.ai")}</Text>
                <AiCoverageBars coverage={detail.data!.coverage} />
              </View>
            </>
          ) : null}

          <SettingsGroup title={`${t("admin.detail.sessions")}${sessions.data ? ` (${sessions.data.length})` : ""}`}>
            {sessions.isPending ? (
              <Skeleton className="m-4 h-12 rounded-xl" />
            ) : !sessions.data?.length ? (
              <Text className="p-4 text-[14px] text-muted-foreground">{t("admin.detail.noSessions")}</Text>
            ) : null}
            {(sessions.data ?? []).map((s) => {
              const device = parseUserAgent(s.userAgent);
              return (
                <SettingsRow
                  key={s.id}
                  icon={device.mobile ? Smartphone : Monitor}
                  title={[device.browser, device.os].filter(Boolean).join(" · ") || t("settings.sessions.unknownDevice")}
                  subtitle={`${s.ipAddress || "—"} · ${formatRelative(String(s.updatedAt), i18n.language)}`}
                  busy={revokeSession.isPending && revokeSession.variables === s.token}
                  trailing={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("admin.detail.revoke")}
                      hitSlop={8}
                      disabled={revokeSession.isPending}
                      onPress={() => revokeSession.mutate(s.token, { onError: () => Alert.alert(t("lightbox.actionFailed")) })}
                      className="size-9 items-center justify-center rounded-full active:bg-foreground/10"
                    >
                      <Icon as={X} size={18} className="text-muted-foreground" />
                    </Pressable>
                  }
                />
              );
            })}
          </SettingsGroup>

          {user && user.id !== me ? (
            <SettingsGroup title={t("admin.table.actions")}>
              <SettingsRow
                icon={user.role === "admin" ? ShieldOff : ShieldCheck}
                title={user.role === "admin" ? t("admin.action.makeUser") : t("admin.action.makeAdmin")}
                busy={busy("role")}
                onPress={() => run("role")}
              />
              <SettingsRow icon={LogOut} title={t("admin.action.revokeSessions")} busy={busy("logout")} onPress={() => run("logout")} />
              {user.banned ? (
                <SettingsRow icon={Unlock} title={t("admin.action.unban")} busy={busy("unban")} onPress={() => run("unban")} />
              ) : (
                <SettingsRow icon={Ban} title={t("admin.action.ban")} onPress={banning ? undefined : () => setBanning(true)}>
                  {banning ? (
                    <View className="gap-2.5">
                      <Text className="text-[13px] text-muted-foreground">{t("admin.action.banConfirm", { name })}</Text>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        maxLength={200}
                        autoFocus
                        placeholder={t("admin.action.banReasonPlaceholder")}
                        placeholderTextColor={colors.mutedForeground}
                        accessibilityLabel={t("admin.action.banReason")}
                        className="h-11 rounded-2xl bg-background px-3.5 font-sans text-[15px] text-foreground"
                      />
                      <View className="flex-row gap-2">
                        <Pressable
                          accessibilityRole="button"
                          disabled={action.isPending}
                          onPress={() => setBanning(false)}
                          className="h-10 flex-1 items-center justify-center rounded-full border border-border active:bg-muted"
                        >
                          <Text className="text-[14px] font-semibold">{t("common.cancel")}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={action.isPending}
                          onPress={() => run("ban", { reason: reason.trim() })}
                          className={cn("h-10 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-destructive active:opacity-80", action.isPending && "opacity-60")}
                        >
                          {busy("ban") ? <ActivityIndicator size="small" color="white" /> : null}
                          <Text className="text-[14px] font-semibold text-white">{t("admin.action.ban")}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </SettingsRow>
              )}
              <SettingsRow icon={Trash2} title={t("admin.action.delete")} destructive busy={busy("delete")} onPress={confirmDelete} />
            </SettingsGroup>
          ) : null}
        </View>
      </ScrollView>

      <GlassBackButton />
    </KeyboardAvoidingView>
  );
}
