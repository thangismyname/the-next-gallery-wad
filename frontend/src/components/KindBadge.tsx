import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { UserKind } from "@tng/shared";
import { KIND_STYLE } from "@/lib/userKind";
import { cn } from "@/lib/utils";

/** Soft icon chip of an account kind (admin / developer / user), colors from `lib/userKind.ts`. */
export function KindBadge({ kind, className }: { kind: UserKind; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, chip, label } = KIND_STYLE[kind];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium", chip, className)}>
      <Icon className="size-3" />
      {t(label)}
    </span>
  );
}

/** Soft "banned" badge (only banned accounts get one — "active" is the normal case). */
export function BannedBadge({ reason }: { reason?: string | null }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive" title={reason ?? undefined}>
      {t("admin.status.banned")}
    </Badge>
  );
}
