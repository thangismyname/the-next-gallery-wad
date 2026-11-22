import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Check, Code2, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDeveloperRequests } from "./useAdminDeveloperRequests";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import { UserCell } from "@/features/admin/shared/UserCell";
import { formatRelative, type AdminDeveloperRequest, type DeveloperStatus } from "@tng/shared";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_VARIANT: Record<DeveloperStatus, "default" | "destructive" | "secondary"> = {
  none: "secondary",
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

/** /admin/developer — duyệt yêu cầu Developer Mode; tìm (?q=, tên / email) + lọc trạng thái (?status=) như trang Users. */
export function AdminDeveloperView() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as Filter)
    : "pending";
  const { requests, loading, error, review, reviewingId } = useAdminDeveloperRequests();

  const count = (f: Filter) =>
    f === "all" ? requests.length : requests.filter((r) => r.status === f).length;
  const q = params.get("q") ?? "";
  const needle = q.trim().toLowerCase();
  const shown = requests.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!needle || `${r.userName} ${r.userEmail}`.toLowerCase().includes(needle)),
  );
  const update = (key: "q" | "status", value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

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

      {/* Bộ lọc — giống trang Users, xuống dòng trên màn hẹp */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => update("q", e.target.value || null)}
            placeholder={t("admin.users.search")}
            className="pl-9"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(v) => update("status", v === "pending" ? null : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {f === "all" ? t("admin.users.allStatus") : t(`admin.developer.status.${f}`)}
                <span className="text-muted-foreground tabular-nums">{count(f)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">
          {t("admin.error.loadFailed")}
        </p>
      ) : loading ? (
        <Skeleton className="h-96 rounded-xl bg-muted/40" />
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
