import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Check, Code2, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminDeveloperRequests } from "@/hooks/useAdminDeveloperRequests";
import type { AdminDeveloperRequest, DeveloperStatus } from "@/services/developer";
import { AdminPageHeader } from "./components/AdminPageHeader";
import { UserCell } from "./components/UserCell";
import { formatRelative } from "@/utils/format";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_VARIANT: Record<DeveloperStatus, "default" | "destructive" | "secondary"> = {
  none: "secondary",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

/** /admin/developer — duyệt yêu cầu Developer Mode, lọc theo trạng thái (?status=). */
export function AdminDeveloperView() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as Filter)
    : "pending";
  const { requests, loading, error, review, reviewingId } = useAdminDeveloperRequests();

  const count = (f: Filter) =>
    f === "all" ? requests.length : requests.filter((r) => r.status === f).length;
  const shown = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const actions = (req: AdminDeveloperRequest) =>
    req.status === "pending" ? (
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          disabled={reviewingId === req.id}
          onClick={() => void review(req.id, true)}
        >
          {reviewingId === req.id ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {t("admin.developer.approve")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewingId === req.id}
          onClick={() => void review(req.id, false)}
        >
          <X className="size-4" />
          {t("admin.developer.reject")}
        </Button>
      </div>
    ) : null;

  const statusBadge = (req: AdminDeveloperRequest) => (
    <Badge variant={STATUS_VARIANT[req.status]}>
      {t(`admin.developer.status.${req.status}`)}
    </Badge>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title={t("admin.nav.developer")}
        subtitle={t("admin.developer.desc")}
      />

      <Tabs
        value={filter}
        onValueChange={(v) =>
          setParams(v === "pending" ? {} : { status: v }, { replace: true })
        }
      >
        <TabsList className="max-w-full overflow-x-auto">
          {FILTERS.map((f) => (
            <TabsTrigger key={f} value={f} className="gap-1.5">
              {f === "all" ? t("admin.developer.all") : t(`admin.developer.status.${f}`)}
              <span className="text-muted-foreground tabular-nums">{count(f)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">
          {t("admin.error.loadFailed")}
        </p>
      ) : loading ? (
        <Skeleton className="h-64 rounded-xl bg-muted/40" />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 py-16 text-sm text-muted-foreground">
          <Code2 className="size-8 animate-float text-muted-foreground/40" />
          {t("admin.developer.empty")}
        </div>
      ) : (
        <>
          {/* Desktop / tablet: bảng */}
          <div className="hidden overflow-hidden rounded-xl border border-border/60 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("admin.table.user")}</TableHead>
                  <TableHead>{t("admin.developer.message")}</TableHead>
                  <TableHead>{t("admin.table.status")}</TableHead>
                  <TableHead>{t("admin.developer.sentAt")}</TableHead>
                  <TableHead className="text-right">{t("admin.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="max-w-64">
                      <UserCell
                        name={req.userName}
                        email={req.userEmail}
                        image={req.userImage}
                      />
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-muted-foreground">
                      {req.message ? `“${req.message}”` : "—"}
                    </TableCell>
                    <TableCell>{statusBadge(req)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelative(req.createdAt, i18n.language)}
                    </TableCell>
                    <TableCell>{actions(req)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: thẻ */}
          <ul className="space-y-2 md:hidden">
            {shown.map((req) => (
              <li
                key={req.id}
                className="space-y-2 rounded-xl border border-border/60 bg-card p-3"
              >
                <div className="flex items-start gap-2">
                  <UserCell
                    name={req.userName}
                    email={req.userEmail}
                    image={req.userImage}
                    className="flex-1"
                  />
                  {statusBadge(req)}
                </div>
                {req.message && (
                  <p className="text-xs text-muted-foreground">“{req.message}”</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(req.createdAt, i18n.language)}
                  </span>
                  {actions(req)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
