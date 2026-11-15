import type { AdminOverview, AiCoverage, UserKind } from "@tng/shared";
import { Code2, ShieldCheck, UserRound, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { AI_BAR, type AiSource } from "@/lib/aiColors";
import { cn } from "@/lib/utils";

/** Mono uppercase section label (web `font-mono text-xs tracking-widest uppercase`). */
export const SECTION_LABEL = "text-[11px] uppercase tracking-widest text-muted-foreground";

/** Bordered card with a mono title + optional right side (web admin `Card`). */
export function AdminCard({ title, right, children, flush }: { title: string; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="min-h-12 flex-row items-center justify-between gap-2 px-4 py-3">
        <Text className={SECTION_LABEL}>{title}</Text>
        {right}
      </View>
      <View className={flush ? undefined : "px-4 pb-4"}>{children}</View>
    </View>
  );
}

export type AdminStat = { key: string; icon: LucideIcon; label: string; value: ReactNode; onPress?: () => void; highlight?: boolean };

/** Hairline stat grid (web `AdminStatGrid`): rows of `cols` cells, 1px lines between them. */
export function AdminStatGrid({ stats, loading, cols = 2 }: { stats: AdminStat[]; loading?: boolean; cols?: number }) {
  const rows = Array.from({ length: Math.ceil(stats.length / cols) }, (_, r) => stats.slice(r * cols, r * cols + cols));
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-border" style={{ gap: 1 }}>
      {rows.map((row, r) => (
        <View key={r} className="flex-row" style={{ gap: 1 }}>
          {row.map(({ key, icon, label, value, onPress, highlight }) => (
            <Pressable
              key={key}
              disabled={!onPress}
              onPress={onPress}
              accessibilityRole={onPress ? "link" : undefined}
              className={cn("min-w-0 flex-1 bg-card p-3.5", onPress && "active:bg-muted")}
            >
              <View className="flex-row items-center gap-1.5">
                <Icon as={icon} size={12} className="text-muted-foreground" />
                <Text numberOfLines={1} className={cn(SECTION_LABEL, "flex-1 text-[10px]")}>
                  {label}
                </Text>
              </View>
              {loading ? (
                <Skeleton className="mt-2 h-7 w-14 rounded" />
              ) : (
                <Text numberOfLines={1} className={cn("mt-1.5 font-heading text-[26px] tabular-nums", highlight && "font-semibold")}>
                  {value}
                </Text>
              )}
            </Pressable>
          ))}
          {/* Pad a short last row so its cells keep the column width. */}
          {Array.from({ length: cols - row.length }, (_, i) => (
            <View key={`pad${i}`} className="flex-1 bg-card" />
          ))}
        </View>
      ))}
    </View>
  );
}

const PIPELINES: { key: keyof AiCoverage["done"]; source: AiSource }[] = [
  { key: "tags", source: "tag" },
  { key: "clip", source: "clip" },
  { key: "yolo", source: "yolo" },
  { key: "dino", source: "dino" },
];

/** Progress of the 4 AI pipelines (done / total photos) in the AI source colors (web `AiCoverageBars`). */
export function AiCoverageBars({ coverage }: { coverage: AiCoverage }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      {PIPELINES.map(({ key, source }) => {
        const done = coverage.done[key];
        const percent = coverage.total ? Math.round((done / coverage.total) * 100) : 0;
        return (
          <View key={key} className="gap-1.5">
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-1.5">
                <View className={cn("size-2 rounded-full", AI_BAR[source])} />
                <Text className="text-[14px] font-medium">{t(`settings.ai.${key}.name`)}</Text>
              </View>
              <Text className="text-[12px] tabular-nums text-muted-foreground">
                {done}/{coverage.total} · {percent}%
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-muted">
              <View className={cn("h-full rounded-full", AI_BAR[source])} style={{ width: `${percent}%` }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Avatar + name + email (web `UserCell`). */
export function UserCell({ name, email, image }: { name: string; email: string; image?: string | null }) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <PersonAvatar name={name || email} image={image} size={36} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-medium">
          {name || email}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-muted-foreground">
          {email}
        </Text>
      </View>
    </View>
  );
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";
// Soft tints, not solid black / red blocks — a card full of solid badges reads as noise.
const BADGE: Record<BadgeVariant, { box: string; text: string }> = {
  default: { box: "bg-foreground/10", text: "text-foreground" },
  secondary: { box: "bg-muted", text: "text-muted-foreground" },
  outline: { box: "border border-border", text: "text-muted-foreground" },
  destructive: { box: "bg-destructive/10", text: "text-destructive" },
};

/** Badge with the web admin's variant names (soft colors on mobile). */
export function AdminBadge({ label, variant = "secondary" }: { label: string; variant?: BadgeVariant }) {
  return (
    <View className={cn("rounded-full px-2 py-0.5", BADGE[variant].box)}>
      <Text className={cn("text-[11px] font-semibold", BADGE[variant].text)}>{label}</Text>
    </View>
  );
}

/** One color per kind (admin = red · developer = amber · user = blue): card border + icon + label — same as web `lib/userKind.ts`. */
export const KIND_STYLE: Record<UserKind, { icon: LucideIcon; border: string; text: string; box: string; label: string }> = {
  admin: { icon: ShieldCheck, border: "border-red-500/50", text: "text-red-600 dark:text-red-400", box: "bg-red-500/10", label: "admin.role.admin" },
  developer: { icon: Code2, border: "border-amber-500/50", text: "text-amber-700 dark:text-amber-400", box: "bg-amber-500/10", label: "developer.title" },
  user: { icon: UserRound, border: "border-blue-500/40", text: "text-blue-600 dark:text-blue-400", box: "bg-blue-500/10", label: "admin.role.user" },
};

/** Icon + label chip of a user's kind, in its color. */
export function KindChip({ kind }: { kind: UserKind }) {
  const { t } = useTranslation();
  const k = KIND_STYLE[kind];
  return (
    <View className={cn("flex-row items-center gap-1 rounded-full px-2 py-0.5", k.box)}>
      <Icon as={k.icon} size={12} className={k.text} />
      <Text className={cn("text-[11px] font-semibold", k.text)}>{t(k.label)}</Text>
    </View>
  );
}

const CHART_H = 180;
const PAD_LEFT = 32;
const PAD_BOTTOM = 20;

/**
 * 30-day signups + uploads (web `AdminActivityChart`, recharts area chart) drawn
 * with react-native-svg: uploads = foreground, signups = muted. Touch / drag =
 * that day's values (web tooltip).
 */
export function AdminActivityChart({ data }: { data: AdminOverview["activity"] }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const max = Math.max(1, ...data.flatMap((d) => [d.uploads, d.signups]));
  const top = Math.ceil(max / 2) * 2; // even → the middle grid line is a whole number
  const plotW = Math.max(0, width - PAD_LEFT);
  const plotH = CHART_H - PAD_BOTTOM;
  const x = (i: number) => PAD_LEFT + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => plotH - (v / top) * (plotH - 8);
  const line = (key: "uploads" | "signups") => data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join(" ");
  const area = (key: "uploads" | "signups") => `${line(key)} L${x(data.length - 1)},${plotH} L${x(0)},${plotH} Z`;
  const short = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "numeric" });
  const pick = (px: number) => {
    if (!data.length) return;
    const i = Math.round(((px - PAD_LEFT) / (plotW || 1)) * (data.length - 1));
    setPicked(Math.min(data.length - 1, Math.max(0, i)));
  };
  const day = picked !== null ? data[picked] : null;

  return (
    <AdminCard
      title={t("admin.chart.activity")}
      right={day ? <Text className="text-[12px] tabular-nums text-muted-foreground">{short(day.date)}</Text> : undefined}
    >
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setPicked(null)}
        onResponderTerminate={() => setPicked(null)}
        style={{ height: CHART_H }}
      >
        {width > 0 ? (
          <Svg width={width} height={CHART_H}>
            {[0, top / 2, top].map((v) => (
              <Line key={v} x1={PAD_LEFT} x2={width} y1={y(v)} y2={y(v)} stroke={colors.border} strokeDasharray="3 3" />
            ))}
            <Path d={area("signups")} fill={colors.mutedForeground} fillOpacity={0.1} />
            <Path d={line("signups")} stroke={colors.mutedForeground} strokeWidth={2} fill="none" />
            <Path d={area("uploads")} fill={colors.foreground} fillOpacity={0.12} />
            <Path d={line("uploads")} stroke={colors.foreground} strokeWidth={2} fill="none" />
            {picked !== null ? <Line x1={x(picked)} x2={x(picked)} y1={0} y2={plotH} stroke={colors.ring} /> : null}
          </Svg>
        ) : null}
        {/* Axis labels as Text (theme fonts), positioned over the svg. */}
        {[0, top / 2, top].map((v) => (
          <Text key={v} className="absolute left-0 w-7 text-right text-[10px] tabular-nums text-muted-foreground" style={{ top: y(v) - 7 }}>
            {v}
          </Text>
        ))}
        {data.length && width
          ? [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
              <Text
                key={i}
                className="absolute bottom-0 w-12 text-center text-[10px] text-muted-foreground"
                style={{ left: Math.min(width - 48, Math.max(PAD_LEFT - 8, x(i) - 24)) }}
              >
                {short(data[i].date)}
              </Text>
            ))
          : null}
      </View>
      <View className="mt-3 flex-row justify-center gap-5">
        {(["uploads", "signups"] as const).map((key) => (
          <View key={key} className="flex-row items-center gap-1.5">
            <View className={cn("size-2 rounded-sm", key === "uploads" ? "bg-foreground" : "bg-muted-foreground")} />
            <Text className="text-[12px] text-muted-foreground">
              {t(`admin.chart.${key}`)}
              {day ? <Text className="text-[12px] font-semibold tabular-nums text-foreground">{`  ${day[key]}`}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
    </AdminCard>
  );
}
