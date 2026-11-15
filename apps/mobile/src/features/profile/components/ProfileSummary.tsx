import { formatBytes, getInitials, resolveMediaUrl, userKind } from "@tng/shared";
import { CalendarDays, Film, HardDrive, Heart, Image as ImageIcon, Sparkles, Users, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { KIND_STYLE, KindChip } from "@/features/admin/components/AdminUi";
import type { SessionUser } from "@/features/auth/session";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { cn } from "@/lib/utils";

import { useProfileStats } from "../useProfile";

const PROVIDER_LABEL: Record<string, string> = { credential: "Email", google: "Google", github: "GitHub" };

/** Account card (avatar · name · email · badges · joined) + a hairline stat grid (web `ProfileSummaryCard`). */
export function ProfileSummary({ user, providers }: { user: SessionUser; providers: string[] }) {
  const { t, i18n } = useTranslation();
  const { data: stats, isPending } = useProfileStats();
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" })
    : null;
  const role = (user as { role?: string | null }).role;
  const { isDeveloper } = useDeveloperMode();
  const kind = userKind({ role, isDeveloper });

  const items: { icon: LucideIcon; label: string; value?: string }[] = [
    { icon: ImageIcon, label: t("profile.stats.photos"), value: stats && String(stats.photos) },
    { icon: Film, label: t("profile.stats.videos"), value: stats && String(stats.videos) },
    { icon: Heart, label: t("profile.stats.favorites"), value: stats && String(stats.favorites) },
    { icon: Users, label: t("profile.stats.friends"), value: stats && String(stats.friends) },
    { icon: Sparkles, label: t("profile.stats.moments"), value: stats && String(stats.moments) },
    { icon: HardDrive, label: t("profile.stats.storage"), value: stats && formatBytes(stats.storageBytes) },
  ];

  return (
    <View className="gap-3 px-4">
      {/* Account card (Google Photos style): avatar · name · email · badges. */}
      <View className={cn("flex-row items-center gap-4 rounded-3xl border bg-muted/60 p-4", KIND_STYLE[kind].border)}>
        <Avatar alt={user.name} style={{ width: 60, height: 60 }}>
          {user.image ? <AvatarImage source={{ uri: resolveMediaUrl(user.image) }} /> : null}
          <AvatarFallback>
            <Text className="text-xl font-semibold">{getInitials(user.name)}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="text-[19px] font-semibold">
            {user.name}
          </Text>
          <Text numberOfLines={1} className="text-[14px] text-muted-foreground">
            {user.email}
          </Text>
          <View className="flex-row flex-wrap gap-1.5 pt-0.5">
            <KindChip kind={kind} />
            <Pill label={user.emailVerified ? t("profile.verified") : t("profile.unverified")} />
            {providers.map((p) => (
              <Pill key={p} label={PROVIDER_LABEL[p] ?? p} />
            ))}
          </View>
          {joined ? (
            <View className="flex-row items-center gap-1.5 pt-0.5">
              <Icon as={CalendarDays} size={13} className="text-muted-foreground" />
              <Text className="text-[12px] text-muted-foreground">{t("profile.joined", { date: joined })}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Hairline grid like the web stat blocks (gap-px on a border-colored background). */}
      <View className="flex-row flex-wrap overflow-hidden rounded-3xl bg-foreground/10" style={{ gap: 1 }}>
        {items.map(({ icon, label, value }) => (
          <View key={label} className="gap-1 bg-background p-3.5" style={{ width: "33.1%", flexGrow: 1 }}>
            <View className="flex-row items-center gap-1">
              <Icon as={icon} size={12} className="text-muted-foreground" />
              <Text numberOfLines={1} className="flex-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {label}
              </Text>
            </View>
            {isPending ? (
              <Skeleton className="my-1 h-6 w-12 rounded-md" />
            ) : (
              <Text numberOfLines={1} className="font-heading text-[22px]">
                {value ?? "0"}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border px-2.5 py-0.5">
      <Text className="text-[12px] text-muted-foreground">{label}</Text>
    </View>
  );
}
