import { formatCountdown, type FriendRequest, type FriendSearchResult } from "@tng/shared";
import { Check, QrCode, RefreshCw, Search, Share2, Undo2, UserPlus, Users, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { WEB_URL } from "@/lib/config";

import { useFriendInvite, useFriendSearch } from "../useFriends";
import { PersonRow, RowAction } from "./FriendRows";

const asRequest = (r: FriendSearchResult): FriendRequest => ({
  id: r.requestId ?? "",
  userId: r.id,
  name: r.name,
  email: r.email,
  avatarUrl: r.avatarUrl,
  requestedAt: null,
});

/**
 * Find people (web `AddFriendPanel`): a full email or ≥ 2 letters of a name;
 * each result shows the relationship and the matching action — add · accept
 * their invite · cancel mine · already friends.
 */
export function AddFriendSearch({
  query,
  onQueryChange,
  busy,
  onAdd,
  onAccept,
  onCancel,
  autoFocus,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  busy: Record<string, string>;
  onAdd: (userId: string) => void;
  onAccept: (r: FriendRequest) => void;
  onCancel: (r: FriendRequest) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { results, searching, error, tooShort, searched } = useFriendSearch(query);

  const action = (r: FriendSearchResult) => {
    const isBusy = Boolean(busy[r.id] || (r.requestId && busy[r.requestId]));
    switch (r.relationship) {
      case "friends":
        return (
          <View className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5">
            <Icon as={Users} size={14} className="text-muted-foreground" />
            <Text className="text-[13px] text-muted-foreground">{t("friends.relation.friends")}</Text>
          </View>
        );
      case "pending_inbound":
        return <RowAction label={t("friends.accept")} icon={Check} primary text busy={isBusy} onPress={() => onAccept(asRequest(r))} />;
      case "pending_outbound":
        return <RowAction label={t("friends.cancelRequest")} icon={Undo2} text busy={isBusy} onPress={() => onCancel(asRequest(r))} />;
      default:
        return <RowAction label={t("friends.sendRequest")} icon={UserPlus} primary text busy={isBusy} onPress={() => onAdd(r.id)} />;
    }
  };

  return (
    <View className="gap-3">
      <View className="h-12 flex-row items-center gap-2 rounded-2xl bg-muted px-3.5">
        <Icon as={Search} size={17} className="text-muted-foreground" />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="search"
          placeholder={t("friends.addPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          className="h-full flex-1 font-sans text-[16px] text-foreground"
        />
        {searching ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : null}
        {query && !searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={8} onPress={() => onQueryChange("")}>
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>

      {!query.trim() ? (
        <Text className="px-1 text-[13px] text-muted-foreground">{t("friends.addHint")}</Text>
      ) : tooShort ? (
        <Text className="px-1 text-[13px] text-muted-foreground">{t("friends.searchHint")}</Text>
      ) : error ? (
        <Text className="px-1 text-[13px] text-destructive">{t("friends.actionFailed")}</Text>
      ) : searched && !results.length ? (
        <Text className="px-1 text-[13px] text-muted-foreground">{t("friends.notFound")}</Text>
      ) : results.length ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {results.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <View className="ml-[72px] h-px bg-border" /> : null}
              <PersonRow
                name={r.name}
                image={r.avatarUrl}
                subtitle={r.relationship === "none" ? r.email : t(`friends.relation.${r.relationship}`)}
              >
                {action(r)}
              </PersonRow>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Quick invite (web `FriendInviteCard`): QR + link to `${WEB_URL}/friends/invite?t=`
 * — a friend scans it or opens the link to send you a request. Countdown to
 * expiry, "New code" re-issues it, Share opens the system sheet (Messages, Copy…).
 */
export function InviteCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const invite = useFriendInvite();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const data = invite.data;
  const url = data?.token ? `${WEB_URL}/friends/invite?t=${encodeURIComponent(data.token)}` : "";
  const remaining = data ? data.expiresAt - now : 0;
  const expired = Boolean(data) && remaining <= 0;

  return (
    <View className="gap-4 rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Icon as={QrCode} size={18} className="text-foreground" />
        <Text className="flex-1 text-[16px] font-semibold">{t("friends.inviteTitle")}</Text>
        {data && !expired ? (
          <Text className="text-[12px] tabular-nums text-muted-foreground">
            {t("friends.inviteExpiresIn", { time: formatCountdown(Math.ceil(remaining / 1000)) })}
          </Text>
        ) : null}
      </View>

      <View className="items-center">
        <View className="size-[188px] items-center justify-center rounded-2xl bg-white p-3">
          {invite.isPending ? (
            <ActivityIndicator color={colors.mutedForeground} />
          ) : url && !expired ? (
            <QRCode value={url} size={164} backgroundColor="white" color="black" />
          ) : (
            <Text className="px-3 text-center text-[13px] text-neutral-500">
              {expired ? t("friends.inviteExpired") : t("friends.loadFailed")}
            </Text>
          )}
        </View>
      </View>

      <Text className="text-center text-[13px] text-muted-foreground">{t("friends.inviteHint")}</Text>

      <View className="flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => void invite.refetch()}
          disabled={invite.isFetching}
          className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-muted active:opacity-70"
        >
          {invite.isFetching ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Icon as={RefreshCw} size={15} className="text-foreground" />
          )}
          <Text className="text-[14px] font-semibold">{t("friends.resetInvite")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!url || expired}
          onPress={() => void Share.share({ message: url, url })}
          className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-primary active:opacity-80"
          style={{ opacity: !url || expired ? 0.5 : 1 }}
        >
          <Icon as={Share2} size={15} className="text-primary-foreground" />
          <Text className="text-[14px] font-semibold text-primary-foreground">{t("friends.shareInvite")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
