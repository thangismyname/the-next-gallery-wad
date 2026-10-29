import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarDays,
  Clock,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { parseUserAgent } from "@/features/settings/userAgent";
import {
  adminQueryKeys,
  fetchAdminUserDetail,
  fetchAdminUserSessions,
  revokeAdminUserSession,
} from "@/services/admin";
import { formatBytes } from "@/utils/format";
import { formatDate, formatRelative } from "@/utils/format";
import { AdminUserActions } from "./AdminUserActions";
import { AiCoverageBars } from "./AiCoverageBars";
import { UserCell } from "./UserCell";

const SECTION =
  "font-mono text-[10px] tracking-widest text-muted-foreground uppercase";

/** Panel bên phải: hồ sơ, số liệu, tiến độ AI và phiên đăng nhập của 1 user. */
export function AdminUserSheet({
  userId,
  meId,
  onClose,
}: {
  userId: string | null;
  meId?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const open = Boolean(userId);

  const detail = useQuery({
    queryKey: adminQueryKeys.user(userId ?? ""),
    queryFn: () => fetchAdminUserDetail(userId!),
    enabled: open,
    retry: false,
  });
  const sessions = useQuery({
    queryKey: adminQueryKeys.sessions(userId ?? ""),
    queryFn: () => fetchAdminUserSessions(userId!),
    enabled: open,
  });
  const revoke = useMutation({
    mutationFn: revokeAdminUserSession,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
  });

  const user = detail.data?.user;
  const stats = detail.data?.stats;
  const statCells = stats
    ? [
        { icon: ImageIcon, label: t("admin.kpi.photos"), value: stats.photos },
        { icon: Film, label: t("admin.kpi.videos"), value: stats.videos },
        { icon: HardDrive, label: t("admin.kpi.storage"), value: formatBytes(stats.storageBytes) },
        { icon: FolderOpen, label: t("admin.detail.albums"), value: stats.albums },
        { icon: Sparkles, label: t("admin.detail.moments"), value: stats.moments },
        { icon: Archive, label: t("admin.detail.trashed"), value: stats.trashed },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="sr-only">{t("admin.detail.title")}</SheetTitle>
          <SheetDescription className="sr-only">
            {user?.email ?? ""}
          </SheetDescription>
          {user ? (
            <div className="space-y-3 pr-8">
              <UserCell name={user.name} email={user.email} image={user.image} />
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={user.role === "admin" ? "default" : "outline"}>
                  {t(`admin.role.${user.role}`)}
                </Badge>
                <Badge variant={user.banned ? "destructive" : "secondary"}>
                  {user.banned ? t("admin.status.banned") : t("admin.status.active")}
                </Badge>
                <Badge variant="outline">
                  {user.emailVerified ? t("profile.verified") : t("profile.unverified")}
                </Badge>
                <div className="ml-auto">
                  <AdminUserActions user={user} isSelf={user.id === meId} onDeleted={onClose} />
                </div>
              </div>
              {user.banned && user.banReason && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {t("admin.detail.banReason", { reason: user.banReason })}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {t("admin.detail.joined", { date: formatDate(user.createdAt, i18n.language) })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {t("admin.detail.lastActive", {
                    time: formatRelative(user.lastActiveAt, i18n.language),
                  })}
                </span>
              </div>
            </div>
          ) : detail.isError ? (
            <p className="text-sm text-destructive">{t("admin.error.loadFailed")}</p>
          ) : (
            <Skeleton className="h-24 rounded-lg bg-muted/40" />
          )}
        </SheetHeader>

        <div className="space-y-6 p-4">
          {stats && (
            <>
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60">
                {statCells.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="min-w-0 bg-card p-3">
                    <dt className={`flex items-center gap-1 truncate ${SECTION}`}>
                      <Icon className="size-3 shrink-0" />
                      {label}
                    </dt>
                    <dd className="mt-1 truncate font-heading text-xl tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              <section className="space-y-3">
                <h3 className={SECTION}>{t("admin.detail.ai")}</h3>
                <AiCoverageBars coverage={detail.data!.coverage} />
              </section>
            </>
          )}

          <section className="space-y-3">
            <h3 className={SECTION}>
              {t("admin.detail.sessions")}
              {sessions.data && ` (${sessions.data.length})`}
            </h3>
            {sessions.isPending ? (
              <Skeleton className="h-16 rounded-lg bg-muted/40" />
            ) : !sessions.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("admin.detail.noSessions")}</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {sessions.data.map((s) => {
                  const device = parseUserAgent(s.userAgent);
                  const Icon = device.mobile ? Smartphone : Monitor;
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {device.browser} · {device.os}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.ipAddress || "—"} · {formatRelative(s.updatedAt, i18n.language)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={revoke.isPending}
                        aria-label={t("admin.detail.revoke")}
                        title={t("admin.detail.revoke")}
                        onClick={() => revoke.mutate(s.token)}
                      >
                        {revoke.isPending && revoke.variables === s.token ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
