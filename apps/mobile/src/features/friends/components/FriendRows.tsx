import { formatDate, type Friend, type FriendRequest } from "@tng/shared";
import { Check, Ellipsis, Undo2, X } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, Share, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/** Avatar · name · subtitle · trailing actions (one row of a grouped list). */
export function PersonRow({
  name,
  image,
  subtitle,
  children,
}: {
  name: string;
  image?: string | null;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <PersonAvatar name={name} image={image} size={44} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[16px] font-medium">
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Small round / pill action button of a row. */
export function RowAction({
  label,
  icon,
  onPress,
  busy,
  primary,
  text,
}: {
  label: string;
  icon: typeof Check;
  onPress: () => void;
  busy?: boolean;
  primary?: boolean;
  /** Show the label next to the icon (pill) instead of an icon-only circle. */
  text?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      hitSlop={6}
      onPress={onPress}
      className={cn(
        "h-9 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-70",
        text ? "px-3.5" : "w-9",
        primary ? "bg-primary" : "bg-muted",
        busy && "opacity-60",
      )}
    >
      {busy ? (
        <ActivityIndicator size="small" color={primary ? colors.primaryForeground : colors.mutedForeground} />
      ) : (
        <Icon as={icon} size={16} className={primary ? "text-primary-foreground" : "text-foreground"} />
      )}
      {text ? <Text className={cn("text-[14px] font-semibold", primary && "text-primary-foreground")}>{label}</Text> : null}
    </Pressable>
  );
}

/** A friend: email · "friends since", ⋯ = share their email (the system sheet has Copy) / unfriend (confirmed). */
export const FriendRow = memo(function FriendRow({
  friend,
  busy,
  onUnfriend,
}: {
  friend: Friend;
  busy: boolean;
  onUnfriend: (friend: Friend) => void;
}) {
  const { t, i18n } = useTranslation();
  const subtitle = friend.friendSince
    ? `${friend.email} · ${t("friends.since", { date: formatDate(friend.friendSince, i18n.language) })}`
    : friend.email;

  const confirmUnfriend = () =>
    Alert.alert(t("friends.deleteTitle"), t("friends.deleteDesc", { name: friend.name }), [
      { text: t("friends.deleteCancel"), style: "cancel" },
      { text: t("friends.deleteConfirm"), style: "destructive", onPress: () => onUnfriend(friend) },
    ]);

  const more = () => {
    const copy = () => void Share.share({ message: friend.email });
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: friend.name,
          options: [t("friends.shareEmail"), t("friends.unfriend"), t("common.cancel")],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (i) => (i === 0 ? copy() : i === 1 ? confirmUnfriend() : undefined),
      );
      return;
    }
    Alert.alert(friend.name, undefined, [
      { text: t("friends.shareEmail"), onPress: copy },
      { text: t("friends.unfriend"), style: "destructive", onPress: confirmUnfriend },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  return (
    <PersonRow name={friend.name} image={friend.avatarUrl} subtitle={subtitle}>
      <RowAction label={t("friends.more")} icon={Ellipsis} busy={busy} onPress={more} />
    </PersonRow>
  );
});

/** Incoming: Accept · Decline. Sent: Cancel. */
export const RequestRow = memo(function RequestRow({
  request,
  kind,
  busy,
  onAccept,
  onDecline,
  onCancel,
}: {
  request: FriendRequest;
  kind: "incoming" | "sent";
  busy?: string;
  onAccept: (r: FriendRequest) => void;
  onDecline: (r: FriendRequest) => void;
  onCancel: (r: FriendRequest) => void;
}) {
  const { t, i18n } = useTranslation();
  const when = request.requestedAt ? formatDate(request.requestedAt, i18n.language) : undefined;
  return (
    <PersonRow name={request.name} image={request.avatarUrl} subtitle={when ? `${request.email} · ${when}` : request.email}>
      {kind === "incoming" ? (
        <View className="flex-row gap-2">
          <RowAction label={t("friends.decline")} icon={X} busy={busy === "decline"} onPress={() => onDecline(request)} />
          <RowAction label={t("friends.accept")} icon={Check} primary text busy={busy === "accept"} onPress={() => onAccept(request)} />
        </View>
      ) : (
        <RowAction label={t("friends.cancelRequest")} icon={Undo2} text busy={busy === "cancel"} onPress={() => onCancel(request)} />
      )}
    </PersonRow>
  );
});
