import { router, useLocalSearchParams } from "expo-router";
import { ArrowDownUp, UserPlus, Users, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassBackButton } from "@/components/shared/GlassBackButton";
import { Button } from "@/components/ui/button";
import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { normalize } from "@/features/studio/tagCatalog";
import { useLayout } from "@/hooks/useLayout";
import { fadeIn, fadeOut, riseIn } from "@/lib/motion";
import { SEGMENT_SHADOW, cn } from "@/lib/utils";

import { AddFriendSearch, InviteCard } from "./components/AddFriend";
import { FriendRow, RequestRow } from "./components/FriendRows";
import { useFriends } from "./useFriends";

type Tab = "friends" | "requests" | "add";
type Sort = "name" | "recent";

const BAR = 44;

/**
 * Friends (web `FriendsView`, route `/friends`, pushed): tabs Friends · Requests ·
 * Add — like the web on a phone. `?tab=` opens a tab, `?q=` (from Search /
 * Moments) opens Add with the query typed. Friends: filter (accents ignored) +
 * sort A→Z / newest, ⋯ = share email / unfriend. Requests: incoming (accept /
 * decline) + sent (cancel). Add: live search + QR / link invite. No presence /
 * "send photos" on mobile yet (no WebSocket / Quick send).
 */
export function FriendsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { formWidth } = useLayout();
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();
  const f = useFriends();
  const [tab, setTab] = useState<Tab>(() =>
    params.tab === "requests" || params.tab === "add" ? params.tab : params.q ? "add" : "friends",
  );
  const [query, setQuery] = useState(params.q ?? "");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [refreshing, setRefreshing] = useState(false);

  const shown = useMemo(() => {
    const q = normalize(filter.trim());
    const list = q ? f.friends.filter((x) => normalize(x.name).includes(q) || x.email.toLowerCase().includes(q)) : f.friends;
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : (b.friendSince ?? "").localeCompare(a.friendSince ?? ""),
    );
  }, [f.friends, filter, sort]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await f.refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  const tabs: { key: Tab; label: string; count?: number; accent?: boolean }[] = [
    { key: "friends", label: t("friends.friendsTab"), count: f.friends.length },
    { key: "requests", label: t("friends.requestsTab"), count: f.requests.length, accent: true },
    { key: "add", label: t("friends.addTab") },
  ];

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} progressViewOffset={insets.top + BAR} />}
        contentContainerStyle={{
          paddingTop: insets.top + 8 + BAR + 12,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + 16,
          paddingRight: insets.right + 16,
          alignItems: "center",
        }}
      >
        <View style={{ width: formWidth, maxWidth: "100%" }} className="gap-5">
          <View className="gap-1">
            <Text className="font-heading text-3xl font-semibold">{t("friends.title")}</Text>
            <Text className="text-[15px] text-muted-foreground">{t("friends.count", { count: f.friends.length })}</Text>
          </View>

          {/* Tabs (counts; incoming requests in the accent color). */}
          <View className="flex-row rounded-full bg-muted p-1">
            {tabs.map((item) => {
              const active = item.key === tab;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(item.key)}
                  className={cn("h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full", active && "bg-background")}
                  style={active ? SEGMENT_SHADOW : undefined}
                >
                  <Text className={cn("text-[14px] font-semibold", !active && "text-muted-foreground")}>{item.label}</Text>
                  {item.count ? (
                    <View className={cn("min-w-5 items-center rounded-full px-1.5", item.accent ? "bg-primary" : "bg-foreground/10")}>
                      <Text className={cn("text-[11px] font-semibold tabular-nums", item.accent && "text-primary-foreground")}>
                        {item.count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {f.notice ? (
            <Animated.View
              entering={riseIn}
              exiting={fadeOut}
              accessibilityRole="alert"
              className={cn(
                "flex-row items-center gap-2 rounded-2xl px-3.5 py-3",
                f.notice.tone === "ok" ? "bg-emerald-500/10" : "bg-destructive/10",
              )}
            >
              <Text
                className={cn(
                  "flex-1 text-[14px]",
                  f.notice.tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive",
                )}
              >
                {f.notice.text}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={8} onPress={f.clearNotice}>
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </Animated.View>
          ) : null}

          {tab === "friends" ? (
            <Animated.View key="friends" entering={fadeIn} className="gap-3">
              {f.friends.length > 0 ? (
                <View className="flex-row items-center gap-2">
                  <FilterField value={filter} onChangeText={setFilter} placeholder={t("friends.filterPlaceholder")} className="flex-1" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(sort === "name" ? "friends.sort.name" : "friends.sort.recent")}
                    onPress={() => setSort((s) => (s === "name" ? "recent" : "name"))}
                    className="h-11 flex-row items-center gap-1.5 rounded-2xl bg-muted px-3 active:opacity-70"
                  >
                    <Icon as={ArrowDownUp} size={15} className="text-foreground" />
                    <Text className="text-[13px] font-medium">{t(sort === "name" ? "friends.sort.name" : "friends.sort.recent")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {f.listState.pending ? (
                <ListSkeleton />
              ) : f.listState.error ? (
                <Empty icon={Users} title={t("friends.loadFailed")}>
                  <Button variant="outline" onPress={() => void f.listState.refetch()}>
                    <Text>{t("friends.retry")}</Text>
                  </Button>
                </Empty>
              ) : !f.friends.length ? (
                <Empty icon={Users} title={t("friends.empty")}>
                  <Button className="rounded-full" onPress={() => setTab("add")}>
                    <Icon as={UserPlus} size={16} className="text-primary-foreground" />
                    <Text>{t("friends.addFirst")}</Text>
                  </Button>
                </Empty>
              ) : !shown.length ? (
                <Text className="py-8 text-center text-[14px] text-muted-foreground">{t("friends.noMatch")}</Text>
              ) : (
                <Group>
                  {shown.map((friend, i) => (
                    <Divided key={friend.id} first={i === 0}>
                      <FriendRow friend={friend} busy={Boolean(f.busy[friend.id])} onUnfriend={f.unfriend} />
                    </Divided>
                  ))}
                </Group>
              )}
            </Animated.View>
          ) : tab === "requests" ? (
            <Animated.View key="requests" entering={fadeIn} className="gap-5">
              {f.requestsState.pending ? (
                <ListSkeleton />
              ) : f.requestsState.error ? (
                <Empty icon={UserPlus} title={t("friends.requestsLoadFailed")}>
                  <Button variant="outline" onPress={() => void f.requestsState.refetch()}>
                    <Text>{t("friends.retry")}</Text>
                  </Button>
                </Empty>
              ) : !f.requests.length && !f.sentRequests.length ? (
                <Empty icon={UserPlus} title={t("friends.requestsEmpty")} />
              ) : (
                <>
                  {f.requests.length ? (
                    <Section title={t("friends.incoming", { count: f.requests.length })}>
                      {f.requests.map((r, i) => (
                        <Divided key={r.id} first={i === 0}>
                          <RequestRow request={r} kind="incoming" busy={f.busy[r.id]} onAccept={f.accept} onDecline={f.decline} onCancel={f.cancel} />
                        </Divided>
                      ))}
                    </Section>
                  ) : null}
                  {f.sentRequests.length ? (
                    <Section title={t("friends.outgoing", { count: f.sentRequests.length })}>
                      {f.sentRequests.map((r, i) => (
                        <Divided key={r.id} first={i === 0}>
                          <RequestRow request={r} kind="sent" busy={f.busy[r.id]} onAccept={f.accept} onDecline={f.decline} onCancel={f.cancel} />
                        </Divided>
                      ))}
                    </Section>
                  ) : null}
                </>
              )}
            </Animated.View>
          ) : (
            <Animated.View key="add" entering={fadeIn} className="gap-5">
              <AddFriendSearch
                query={query}
                onQueryChange={setQuery}
                busy={f.busy}
                onAdd={f.add}
                onAccept={f.accept}
                onCancel={f.cancel}
                autoFocus={!params.q && params.tab === "add"}
              />
              <InviteCard />
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <GlassBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </KeyboardAvoidingView>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <View className="overflow-hidden rounded-2xl border border-border bg-card">{children}</View>;
}

function Divided({ first, children }: { first: boolean; children: React.ReactNode }) {
  return (
    <View>
      {!first ? <View className="ml-[72px] h-px bg-border" /> : null}
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</Text>
      <Group>{children}</Group>
    </View>
  );
}

function Empty({ icon, title, children }: { icon: typeof Users; title: string; children?: React.ReactNode }) {
  return (
    <Animated.View entering={fadeIn} className="items-center gap-3 px-6 py-10">
      <Icon as={icon} size={36} className="text-muted-foreground/50" />
      <Text className="text-center text-[15px] text-muted-foreground">{title}</Text>
      {children}
    </Animated.View>
  );
}

function ListSkeleton() {
  return (
    <Group>
      {[0, 1, 2].map((i) => (
        <View key={i} className="flex-row items-center gap-3 px-4 py-3">
          <Skeleton className="size-11 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-1/2 rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </View>
        </View>
      ))}
    </Group>
  );
}

