import { formatRelative, type DeveloperStatus } from "@tng/shared";
import { Check, Code2, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

import { useAdminDeveloperRequests } from "../useAdmin";
import { AdminBadge, UserCell } from "./AdminUi";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_VARIANT: Record<DeveloperStatus, "default" | "destructive" | "secondary"> = {
  none: "secondary",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

/** Web `AdminDeveloperView`: search (name / email) + status filter with counts · cards · approve / reject. */
export function DeveloperTab() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { query, requests, review } = useAdminDeveloperRequests();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");

  const count = (f: Filter) => (f === "all" ? requests.length : requests.filter((r) => r.status === f).length);
  const needle = search.trim().toLowerCase();
  const shown = requests.filter(
    (r) => (filter === "all" || r.status === filter) && (!needle || `${r.userName} ${r.userEmail}`.toLowerCase().includes(needle)),
  );
  const decide = (id: string, approve: boolean) =>
    review.mutate({ id, approve }, { onError: () => Alert.alert(t("lightbox.actionFailed")) });

  return (
    <View className="gap-3">
      <Text className="text-[13px] text-muted-foreground">{t("admin.developer.desc")}</Text>
      <FilterField value={search} onChangeText={setSearch} placeholder={t("admin.users.search")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f)}
              className={cn("h-8 flex-row items-center gap-1.5 rounded-full border px-3", active ? "border-foreground bg-foreground" : "border-border")}
            >
              <Text className={cn("text-[13px] font-medium", active ? "text-background" : "text-muted-foreground")}>
                {f === "all" ? t("admin.users.allStatus") : t(`admin.developer.status.${f}`)}
              </Text>
              <Text className={cn("text-[12px] tabular-nums", active ? "text-background/70" : "text-muted-foreground")}>{count(f)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {query.isError ? (
        <Text className="py-10 text-center text-[14px] text-destructive">{t("admin.error.loadFailed")}</Text>
      ) : query.isPending ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !shown.length ? (
        <View className="items-center gap-2 rounded-2xl border border-dashed border-border py-16">
          <Icon as={Code2} size={32} className="text-muted-foreground/40" />
          <Text className="text-[14px] text-muted-foreground">{t("admin.developer.empty")}</Text>
        </View>
      ) : (
        <View className="gap-2">
          {shown.map((req) => {
            const busy = review.isPending && review.variables?.id === req.id;
            return (
              <View key={req.id} className="gap-2 rounded-2xl border border-border bg-card p-3">
                <View className="flex-row items-start gap-2">
                  <UserCell name={req.userName} email={req.userEmail} image={req.userImage} />
                  <AdminBadge label={t(`admin.developer.status.${req.status}`)} variant={STATUS_VARIANT[req.status]} />
                </View>
                {req.message ? <Text className="text-[13px] text-muted-foreground">“{req.message}”</Text> : null}
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-[12px] text-muted-foreground">{formatRelative(req.createdAt, i18n.language)}</Text>
                  {req.status === "pending" ? (
                    <View className="flex-row gap-1.5">
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => decide(req.id, true)}
                        className={cn("h-9 flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 active:opacity-80", busy && "opacity-60")}
                      >
                        {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Icon as={Check} size={15} className="text-primary-foreground" />}
                        <Text className="text-[13px] font-semibold text-primary-foreground">{t("admin.developer.approve")}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => decide(req.id, false)}
                        className={cn("h-9 flex-row items-center gap-1.5 rounded-full border border-border px-3.5 active:bg-muted", busy && "opacity-60")}
                      >
                        <Icon as={X} size={15} />
                        <Text className="text-[13px] font-semibold">{t("admin.developer.reject")}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
