import { formatBytes, formatRelative, userKind, type AdminUser, type AdminUserQuery, type AdminUserSort } from "@tng/shared";
import { router } from "expo-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { FilterField } from "@/components/shared/FilterField";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Segmented } from "@/features/profile/components/SettingsGroup";
import { useSession } from "@/features/auth/session";
import { cn } from "@/lib/utils";

import { useAdminUsers } from "../useAdmin";
import { AdminBadge, KIND_STYLE, KindChip, UserCell } from "./AdminUi";

const PAGE_SIZE = 20;
const SORTS: { key: AdminUserSort; label: string }[] = [
  { key: "createdAt", label: "admin.table.joined" },
  { key: "lastActive", label: "admin.table.lastActive" },
  { key: "name", label: "admin.table.user" },
  { key: "mediaCount", label: "admin.table.media" },
  { key: "storage", label: "admin.table.storage" },
];

/** Only "banned" is worth a badge — "active" is the normal case. */
export const bannedBadge = (user: AdminUser, t: (k: string) => string) =>
  user.banned ? <AdminBadge label={t("admin.status.banned")} variant="destructive" /> : null;

/**
 * Web `AdminUsersView` on a phone: search (name / email) · role + status filters ·
 * sort (tap the active one = flip direction, like the web column headers) · cards
 * · server paging. A card opens the user detail screen (web side sheet).
 */
export function UsersTab() {
  const { t, i18n } = useTranslation();
  const me = useSession().data?.user.id;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "user" | "developer" | "admin">("all");
  const [status, setStatus] = useState<"all" | "active" | "banned">("all");
  const [sort, setSort] = useState<AdminUserSort>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  // Search only after typing stops (web `useDebounce(…, 300)`).
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query: AdminUserQuery = {
    q: q || undefined,
    role: role === "all" ? undefined : role,
    status: status === "all" ? undefined : status,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const { data, isPending, isError, isFetching } = useAdminUsers(query);
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : query.offset + 1;
  const to = Math.min(total, query.offset + PAGE_SIZE);

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  return (
    <View className="gap-3">
      <Text className="text-[13px] text-muted-foreground">{data ? t("admin.users.count", { n: total }) : " "}</Text>
      <FilterField value={search} onChangeText={setSearch} placeholder={t("admin.users.search")} />
      <View className="gap-2 rounded-2xl bg-muted p-1.5">
        <Segmented
          value={role}
          onChange={filter(setRole)}
          options={[
            { value: "all", label: t("admin.users.allRoles") },
            { value: "user", label: t("admin.role.user") },
            { value: "developer", label: t("admin.role.developer") },
            { value: "admin", label: t("admin.role.admin") },
          ]}
        />
        <Segmented
          value={status}
          onChange={filter(setStatus)}
          options={[
            { value: "all", label: t("admin.users.allStatus") },
            { value: "active", label: t("admin.status.active") },
            { value: "banned", label: t("admin.status.banned") },
          ]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {SORTS.map((s) => {
          const active = s.key === sort;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setDir(active && dir === "desc" ? "asc" : "desc");
                setSort(s.key);
                setPage(0);
              }}
              className={cn("h-8 flex-row items-center gap-1 rounded-full border px-3", active ? "border-foreground bg-foreground" : "border-border")}
            >
              <Text className={cn("text-[13px] font-medium", active ? "text-background" : "text-muted-foreground")}>{t(s.label)}</Text>
              {active ? <Icon as={dir === "asc" ? ArrowUp : ArrowDown} size={13} className="text-background" /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {isError ? (
        <Text className="py-10 text-center text-[14px] text-destructive">{t("admin.error.loadFailed")}</Text>
      ) : isPending ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data.items.length ? (
        <View className="items-center gap-2 rounded-2xl border border-dashed border-border py-16">
          <Icon as={Users} size={32} className="text-muted-foreground/40" />
          <Text className="text-[14px] text-muted-foreground">{t("admin.users.empty")}</Text>
        </View>
      ) : (
        <View className={cn("gap-2", isFetching && "opacity-60")}>
          {data.items.map((user) => (
            <Pressable
              key={user.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/admin-user", params: { id: user.id } })}
              className={cn("gap-2 rounded-2xl border bg-card p-3 active:bg-muted", KIND_STYLE[userKind(user)].border)}
            >
              <View className="flex-row items-center gap-2">
                <UserCell name={user.name} email={user.email} image={user.image} />
                {user.id === me ? <Text className="text-[12px] text-muted-foreground">{t("admin.you")}</Text> : null}
              </View>
              <View className="flex-row flex-wrap items-center gap-1.5">
                <KindChip kind={userKind(user)} />
                {bannedBadge(user, t)}
                <Text className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                  {t("albums.photoCount", { n: user.mediaCount })} · {formatBytes(user.storageBytes)} ·{" "}
                  {formatRelative(user.lastActiveAt, i18n.language)}
                </Text>
              </View>
            </Pressable>
          ))}

          <View className="mt-1 flex-row items-center justify-between">
            <Text className="text-[13px] tabular-nums text-muted-foreground">{t("admin.users.range", { from, to, total })}</Text>
            <View className="flex-row gap-1.5">
              {[
                { label: t("admin.users.prev"), icon: ChevronLeft, disabled: page === 0, next: page - 1 },
                { label: t("admin.users.next"), icon: ChevronRight, disabled: to >= total, next: page + 1 },
              ].map((b) => (
                <Pressable
                  key={b.label}
                  accessibilityRole="button"
                  accessibilityLabel={b.label}
                  disabled={b.disabled}
                  onPress={() => setPage(b.next)}
                  className={cn("size-9 items-center justify-center rounded-full border border-border active:bg-muted", b.disabled && "opacity-40")}
                >
                  <Icon as={b.icon} size={16} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
