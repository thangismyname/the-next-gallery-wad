import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Film,
  Heart,
  Image as ImageIcon,
  HardDrive,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProfileStats, profileStatsQueryKey } from "@/services/profile";
import { CountUp } from "@/components/motion/effects";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";
import { formatBytes } from "@/utils/format";

type Props = {
  name: string;
  email: string;
  image?: string | null;
  createdAt?: Date | string | null;
  emailVerified?: boolean;
  role?: string | null;
  /** providerId của các tài khoản đăng nhập: credential | google | github. */
  providers: string[];
};

const PROVIDER_LABEL: Record<string, string> = {
  credential: "Email",
  google: "Google",
  github: "GitHub",
};

// Lưới số liệu: 2 cột (mobile) → 3 cột (sm+). Ô cuối giãn ra lấp phần lẻ
// của hàng cuối. Class viết tĩnh để Tailwind quét được.
const BASE_COLS = 2;
const SM_COLS = 3;
const BASE_SPAN: Record<number, string> = { 1: "", 2: "col-span-2" };
const SM_SPAN: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
};

/** Số cột ô thứ `index` chiếm: chỉ ô cuối của hàng lẻ mới giãn. */
const lastSpan = (index: number, count: number, cols: number) =>
  index === count - 1 ? cols - (index % cols) : 1;

/** Thẻ tóm tắt: avatar, tên, email, huy hiệu, ngày tham gia + số liệu. */
export const ProfileSummaryCard: React.FC<Props> = ({
  name,
  email,
  image,
  createdAt,
  emailVerified,
  role,
  providers,
}) => {
  const { t, i18n } = useTranslation();
  const { data: stats, isPending } = useQuery({
    queryKey: profileStatsQueryKey,
    queryFn: fetchProfileStats,
    staleTime: 60_000,
  });

  const joined = createdAt
    ? new Date(createdAt).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const statItems = [
    { icon: ImageIcon, label: t("profile.stats.photos"), value: stats?.photos },
    { icon: Film, label: t("profile.stats.videos"), value: stats?.videos },
    {
      icon: Heart,
      label: t("profile.stats.favorites"),
      value: stats?.favorites,
    },
    { icon: Users, label: t("profile.stats.friends"), value: stats?.friends },
    {
      icon: Sparkles,
      label: t("profile.stats.moments"),
      value: stats?.moments,
    },
    {
      icon: HardDrive,
      label: t("profile.stats.storage"),
      value: stats ? formatBytes(stats.storageBytes) : undefined,
    },
  ];

  return (
    <Card>
      {/* Mobile: xếp dọc, căn giữa. md+: thẻ chiếm cả hàng → thông tin bên
          trái, số liệu bên phải. */}
      <CardContent className="flex flex-col items-center gap-4 text-center md:flex-row md:gap-8 md:text-left">
        <div className="flex min-w-0 flex-col items-center gap-4 md:flex-row md:gap-5">
          <Avatar className="size-24 shrink-0 text-2xl">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 space-y-1">
            <h2 className="truncate font-heading text-xl font-semibold">
              {name}
            </h2>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1 md:justify-start">
              {role === "admin" && <Badge>{t("profile.admin")}</Badge>}
              <Badge variant={emailVerified ? "secondary" : "outline"}>
                {emailVerified
                  ? t("profile.verified")
                  : t("profile.unverified")}
              </Badge>
              {providers.map((p) => (
                <Badge key={p} variant="outline">
                  {PROVIDER_LABEL[p] ?? p}
                </Badge>
              ))}
            </div>
            {joined && (
              <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground md:justify-start">
                <CalendarDays className="size-3.5" />
                {t("profile.joined", { date: joined })}
              </p>
            )}
          </div>
        </div>

        {/* Ô số liệu ngăn bằng đường kẻ 1px (gap-px trên nền border) — như landing */}
        <dl className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-3 md:ml-auto md:max-w-md">
          {statItems.map(({ icon: Icon, label, value }, i) => (
            <div
              key={label}
              className={cn(
                "flex min-w-0 flex-col gap-1 bg-card p-3 text-left",
                BASE_SPAN[lastSpan(i, statItems.length, BASE_COLS)],
                SM_SPAN[lastSpan(i, statItems.length, SM_COLS)],
              )}
            >
              <dt className="flex items-center gap-1.5 truncate font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                <Icon className="size-3 shrink-0" />
                {label}
              </dt>
              <dd className="font-heading text-2xl tabular-nums">
                {isPending ? (
                  <Skeleton className="my-1 h-6 w-12 bg-muted/40" />
                ) : typeof value === "number" ? (
                  <CountUp value={String(value)} duration={0.9} />
                ) : (
                  (value ?? 0)
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};
