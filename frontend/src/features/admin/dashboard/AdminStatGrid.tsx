import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/effects";
import { cn } from "@/lib/utils";

export type AdminStat = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  /** Ô bấm được (vd yêu cầu đang chờ → trang duyệt). */
  to?: string;
  highlight?: boolean;
};

/** Ô số liệu ngăn bằng đường kẻ 1px — cùng kiểu landing / Hồ sơ. */
export function AdminStatGrid({
  stats,
  loading,
}: {
  stats: AdminStat[];
  loading?: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map(({ key, icon: Icon, label, value, to, highlight }) => {
        const body = (
          <>
            <dt className="flex items-center gap-1.5 truncate font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              <Icon className="size-3 shrink-0" />
              {label}
            </dt>
            <dd
              className={cn(
                "mt-1.5 font-heading text-3xl tabular-nums",
                highlight && "text-primary",
              )}
            >
              {loading ? (
                <Skeleton className="h-8 w-16 bg-muted/40" />
              ) : typeof value === "number" ? (
                <CountUp value={String(value)} duration={0.9} />
              ) : (
                value
              )}
            </dd>
          </>
        );
        const cell = "block min-w-0 bg-card p-4";
        return to ? (
          <Link
            key={key}
            to={to}
            className={cn(cell, "transition-colors hover:bg-muted/40")}
          >
            {body}
          </Link>
        ) : (
          <div key={key} className={cell}>
            {body}
          </div>
        );
      })}
    </dl>
  );
}
