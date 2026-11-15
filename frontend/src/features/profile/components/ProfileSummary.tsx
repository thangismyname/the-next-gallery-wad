import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Film, HardDrive, Heart, Image as ImageIcon, Sparkles, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/effects";
import { fetchProfileStats } from "@/services/profile";
import { formatBytes, getInitials, profileStatsQueryKey, userKind } from "@tng/shared";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { KindBadge } from "@/components/KindBadge";
import { KIND_STYLE } from "@/lib/userKind";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string;
  image?: string | null;
  createdAt?: Date | string | null;
  emailVerified?: boolean;
  role?: string | null;
  /** providerId of the linked sign-in methods: credential | google | github. */
  providers: string[];
};

const PROVIDER_LABEL: Record<string, string> = { credential: "Email", google: "Google", github: "GitHub" };

/**
 * Account card (avatar · name · email · badges · joined) + hairline stat grid —
 * same content as the mobile account sheet, web styling (Card border, hairline
 * stat grid `bg-border/60` + `bg-card` cells, `Badge`s).
 */
export const ProfileSummary: React.FC<Props> = ({ name, email, image, createdAt, emailVerified, role, providers }) => {
  const { t, i18n } = useTranslation();
  const { isDeveloper } = useDeveloperMode();
  const kind = userKind({ role, isDeveloper });
  const { data: stats, isPending } = useQuery({
    queryKey: profileStatsQueryKey,
    queryFn: fetchProfileStats,
    staleTime: 60_000,
  });
  const joined = createdAt
    ? new Date(createdAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" })
    : null;
  const items = [
    { icon: ImageIcon, label: t("profile.stats.photos"), value: stats?.photos },
    { icon: Film, label: t("profile.stats.videos"), value: stats?.videos },
    { icon: Heart, label: t("profile.stats.favorites"), value: stats?.favorites },
    { icon: Users, label: t("profile.stats.friends"), value: stats?.friends },
    { icon: Sparkles, label: t("profile.stats.moments"), value: stats?.moments },
    { icon: HardDrive, label: t("profile.stats.storage"), value: stats ? formatBytes(stats.storageBytes) : undefined },
  ];

  return (
    <div className="space-y-3">
      <div className={cn("flex items-center gap-4 rounded-xl border bg-card p-4", KIND_STYLE[kind].border)}>
        <Avatar className="size-16 shrink-0 text-xl">
          {image ? <AvatarImage src={image} alt={name} /> : null}
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-lg font-semibold">{name}</h2>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <KindBadge kind={kind} />
            <Badge variant={emailVerified ? "secondary" : "outline"}>
              {emailVerified ? t("profile.verified") : t("profile.unverified")}
            </Badge>
            {providers.map((p) => (
              <Badge key={p} variant="outline">
                {PROVIDER_LABEL[p] ?? p}
              </Badge>
            ))}
          </div>
          {joined && (
            <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {t("profile.joined", { date: joined })}
            </p>
          )}
        </div>
      </div>

      {/* Hairline grid (gap-px on a border-colored background), 3 columns like mobile. */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex min-w-0 flex-col gap-1 bg-card p-3.5">
            <dt className="flex items-center gap-1 truncate font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              <Icon className="size-3 shrink-0" />
              {label}
            </dt>
            <dd className="truncate font-heading text-2xl tabular-nums">
              {isPending ? (
                <Skeleton className="my-1 h-6 w-12 bg-muted" />
              ) : typeof value === "number" ? (
                <CountUp value={String(value)} duration={0.9} />
              ) : (
                (value ?? 0)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
