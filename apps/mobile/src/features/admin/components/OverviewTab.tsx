import { formatBytes, formatRelative } from "@tng/shared";
import { router } from "expo-router";
import { ArrowRight, Code2, Film, HardDrive, Image as ImageIcon, UserPlus, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { useAdminOverview, useAdminSystem } from "../useAdmin";
import { AdminActivityChart, AdminBadge, AdminCard, AdminStatGrid, AiCoverageBars, UserCell } from "./AdminUi";

/** Web `AdminDashboard`: KPIs · 30-day activity · AI system · newest users. */
export function OverviewTab({ onTab }: { onTab: (tab: "users" | "developer") => void }) {
  const { t, i18n } = useTranslation();
  const overview = useAdminOverview();
  const system = useAdminSystem();
  const kpi = overview.data?.kpi;
  const ai = system.data?.aiService;

  if (overview.isError) return <Text className="py-10 text-center text-[14px] text-destructive">{t("admin.error.loadFailed")}</Text>;

  const rows = ai?.online
    ? [
        { label: "CLIP", value: ai.clipModel, provider: ai.providers?.clip },
        { label: "YOLO", value: null, provider: ai.providers?.yolo },
        { label: "DINOv3", value: null, provider: ai.providers?.dino },
        { label: "Tagger", value: ai.tagModel, provider: null },
      ]
    : [];

  return (
    <View className="gap-4">
      <AdminStatGrid
        loading={!kpi}
        stats={[
          { key: "users", icon: Users, label: t("admin.kpi.users"), value: kpi?.users, onPress: () => onTab("users") },
          { key: "new", icon: UserPlus, label: t("admin.kpi.newUsers"), value: kpi?.newUsers },
          { key: "photos", icon: ImageIcon, label: t("admin.kpi.photos"), value: kpi?.photos },
          { key: "videos", icon: Film, label: t("admin.kpi.videos"), value: kpi?.videos },
          { key: "storage", icon: HardDrive, label: t("admin.kpi.storage"), value: kpi ? formatBytes(kpi.storageBytes) : null },
          {
            key: "requests",
            icon: Code2,
            label: t("admin.kpi.pendingRequests"),
            value: kpi?.pendingRequests,
            onPress: () => onTab("developer"),
            highlight: (kpi?.pendingRequests ?? 0) > 0,
          },
        ]}
      />

      {overview.data ? <AdminActivityChart data={overview.data.activity} /> : <Skeleton className="h-64 rounded-2xl" />}

      <AdminCard
        title={t("admin.system.title")}
        right={
          ai ? (
            <View className={cn("flex-row items-center gap-1.5 rounded-full px-2 py-0.5", ai.online ? "bg-secondary" : "bg-destructive")}>
              <View className={cn("size-1.5 rounded-full", ai.online ? "bg-emerald-500" : "bg-white")} />
              <Text className={cn("text-[11px] font-semibold", !ai.online && "text-white")}>
                {ai.online ? t("admin.system.online") : t("admin.system.offline")}
              </Text>
            </View>
          ) : undefined
        }
      >
        {!system.data ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (
          <View className="gap-4">
            {ai?.online ? (
              <View className="gap-1.5">
                {rows.map((row) => (
                  <View key={row.label} className="flex-row items-center gap-3">
                    <Text className="w-16 text-[11px] uppercase tracking-widest text-muted-foreground">{row.label}</Text>
                    <Text numberOfLines={1} className="flex-1 text-[12px]">
                      {row.value ?? row.provider ?? "—"}
                    </Text>
                    {/* Provider "stub" = no real model running → warn */}
                    {row.provider === "stub" ? (
                      <View className="rounded border border-border px-1">
                        <Text className="text-[10px] text-amber-600 dark:text-amber-400">stub</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-[14px] text-muted-foreground">{t("admin.system.offlineHint")}</Text>
            )}
            <View className="gap-3 border-t border-border pt-4">
              <Text className="text-[12px] text-muted-foreground">{t("admin.system.coverage", { n: system.data.coverage.total })}</Text>
              <AiCoverageBars coverage={system.data.coverage} />
            </View>
          </View>
        )}
      </AdminCard>

      <AdminCard
        flush
        title={t("admin.recentUsers")}
        right={
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => onTab("users")} className="flex-row items-center gap-1 active:opacity-60">
            <Text className="text-[13px] font-medium">{t("admin.viewAll")}</Text>
            <Icon as={ArrowRight} size={15} />
          </Pressable>
        }
      >
        {(overview.data?.recentUsers ?? []).map((user) => (
          <Pressable
            key={user.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/admin-user", params: { id: user.id } })}
            className="flex-row items-center gap-3 border-t border-border px-4 py-3 active:bg-muted"
          >
            <UserCell name={user.name} email={user.email} image={user.image} />
            {user.role === "admin" ? <AdminBadge label={t("admin.role.admin")} variant="default" /> : null}
            <Text className="text-[12px] text-muted-foreground">{formatRelative(user.createdAt, i18n.language)}</Text>
          </Pressable>
        ))}
      </AdminCard>
    </View>
  );
}
