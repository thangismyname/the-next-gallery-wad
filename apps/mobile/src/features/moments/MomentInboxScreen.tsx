import { formatRelative, notificationMessage, resolveMediaUrl, type AppNotification, type Moment } from "@tng/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Bell, Check, Clock3, ImagePlus, Trash2, Users, X } from "lucide-react-native";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/shared/GlassButton";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

import { useMomentInbox } from "./useMomentInbox";

/**
 * `/moment-inbox` (bell under the avatar on the Moments tab, web: the bell popover): saved
 * notifications (delete one / all) + moment invitations — tap one with an empty frame of yours to
 * fill it (`/moment-fill`), cancel your own draft that still waits for friends.
 */
export function MomentInboxScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const inbox = useMomentInbox();

  const confirm = (moment: Moment, kind: "delete" | "decline") =>
    Alert.alert(
      t(kind === "decline" ? "moments.declineConfirm" : "moments.deleteShared"),
      t(kind === "decline" ? "moments.declineConfirmDesc" : "moments.deleteSharedDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t(kind === "decline" ? "moments.decline" : "moments.delete"),
          style: "destructive",
          onPress: () =>
            void (kind === "decline" ? inbox.decline(moment.id) : inbox.deleteMoment(moment.id)).catch(() =>
              Alert.alert(t(kind === "decline" ? "moments.declineFailed" : "moments.deleteFailed")),
            ),
        },
      ],
    );

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Platform.OS === "ios" ? 16 : insets.top + 12 }}
      >
        <GlassButton size={40} accessibilityLabel={t("common.close")} onPress={() => router.back()}>
          <Icon as={X} size={20} />
        </GlassButton>
        <Text className="flex-1 text-center text-[17px] font-semibold">{t("moments.invitations")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerClassName="gap-6 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void inbox.refetch()} />}
      >
        {inbox.isPending ? <ActivityIndicator className="py-10" color={colors.mutedForeground} /> : null}

        {inbox.notifications.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Icon as={Bell} size={15} className="text-primary" />
              <Text className="flex-1 text-[13px] font-semibold uppercase">{t("notifications.title")}</Text>
              <Pressable hitSlop={8} onPress={inbox.clearNotifications} className="flex-row items-center gap-1">
                <Icon as={Trash2} size={13} className="text-muted-foreground" />
                <Text className="text-[13px] text-muted-foreground">{t("notifications.clearAll")}</Text>
              </Pressable>
            </View>
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {inbox.notifications.map((n, i) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  divider={i > 0}
                  when={formatRelative(n.createdAt, i18n.language)}
                  onDelete={() => inbox.removeNotification(n.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Icon as={Users} size={15} className="text-primary" />
            <Text className="text-[13px] font-semibold uppercase">{t("moments.invitations")}</Text>
          </View>
          {!inbox.isPending && inbox.invitations.length === 0 ? (
            <Text className="py-6 text-center text-[14px] text-muted-foreground">{t("moments.noInvitations")}</Text>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              {inbox.invitations.map((moment, i) => (
                <InvitationRow
                  key={moment.id}
                  moment={moment}
                  divider={i > 0}
                  onFill={() => router.push({ pathname: "/moment-fill", params: { id: moment.id } })}
                  onDecline={() => confirm(moment, "decline")}
                  onDelete={() => confirm(moment, "delete")}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function NotificationRow({ n, divider, when, onDelete }: { n: AppNotification; divider: boolean; when: string; onDelete: () => void }) {
  const { t } = useTranslation();
  const name = n.actor?.name ?? t("notifications.someone");
  const [key, params] = notificationMessage(n, name);
  const text = t(key, params);
  return (
    <View className={`flex-row items-start gap-3 px-4 py-3 ${divider ? "border-t border-border" : ""}`}>
      <PersonAvatar name={name} image={n.actor?.image} size={32} />
      <View className="flex-1">
        <Text className="text-[14px]">{text}</Text>
        <Text className="text-[12px] text-muted-foreground">{when}</Text>
      </View>
      <Pressable hitSlop={10} accessibilityLabel={t("notifications.delete")} onPress={onDelete} className="p-1">
        <Icon as={X} size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

const STATUS = {
  filled: { icon: Check, key: "moments.slotFilled", tone: "text-emerald-600 dark:text-emerald-400" },
  waiting: { icon: Clock3, key: "moments.slotWaiting", tone: "text-muted-foreground" },
  declined: { icon: X, key: "moments.slotDeclined", tone: "text-destructive" },
} as const;

/** 1 lời mời / moment đang chờ: tiến độ từng ô (ai · đã ghép / đang chờ / từ chối) + hành động. */
function InvitationRow({
  moment,
  divider,
  onFill,
  onDecline,
  onDelete,
}: {
  moment: Moment;
  divider: boolean;
  onFill: () => void;
  onDecline: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const pending = moment.myPendingSlots?.length ?? 0;
  const fillable = pending > 0;
  const slots = [...moment.slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const done = slots.filter((s) => s.filled).length;
  const cover = slots.find((s) => s.filled)?.thumbnailUrl;
  const waitingFor = new Set(slots.filter((s) => !s.filled && !s.declined).map((s) => s.userId)).size;
  const summary = fillable
    ? pending > 1
      ? t("moments.yourSlotsPending", { n: pending })
      : t("moments.yourSlotPending")
    : t("moments.waitingForFriends", { n: waitingFor });

  return (
    <View className={`gap-3 px-4 py-3 ${divider ? "border-t border-border" : ""}`}>
      <View className="flex-row items-center gap-3">
        <View className="size-11 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {cover ? (
            <Image source={{ uri: resolveMediaUrl(cover) }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
          ) : (
            <Icon as={Users} size={18} className="text-muted-foreground" />
          )}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[15px] font-medium">
            {moment.userName}
          </Text>
          <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
            {summary}
          </Text>
        </View>
        <Pressable hitSlop={10} accessibilityLabel={t("moments.deleteShared")} onPress={onDelete} className="p-1">
          <Icon as={Trash2} size={18} className="text-muted-foreground" />
        </Pressable>
      </View>

      <View className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <View className="h-full bg-primary" style={{ width: `${(done / Math.max(1, slots.length)) * 100}%` }} />
          </View>
          <Text className="text-[12px] text-muted-foreground">{t("moments.progress", { done, total: slots.length })}</Text>
        </View>
        {slots.map((slot) => {
          const status = STATUS[slot.filled ? "filled" : slot.declined ? "declined" : "waiting"];
          return (
            <View key={slot.slotIndex} className="flex-row items-center gap-2">
              <PersonAvatar name={slot.userName} image={slot.userAvatarUrl} size={20} />
              <Text numberOfLines={1} className="flex-1 text-[13px]">
                {slot.userName}
              </Text>
              <Icon as={status.icon} size={13} className={status.tone} />
              <Text className={`text-[12px] ${status.tone}`}>{t(status.key)}</Text>
            </View>
          );
        })}
      </View>

      {fillable ? (
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onFill}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-primary py-2 active:opacity-80"
          >
            <Icon as={ImagePlus} size={15} className="text-primary-foreground" />
            <Text className="text-[14px] font-medium text-primary-foreground">{t("moments.accept")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDecline}
            className="flex-1 items-center justify-center rounded-full border border-border py-2 active:bg-muted"
          >
            <Text className="text-[14px]">{t("moments.decline")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
