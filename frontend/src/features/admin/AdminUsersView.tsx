import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  Users,
} from "lucide-react";
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
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { adminQueryKeys, fetchAdminUsers } from "@/services/admin";
import { authClient } from "@/services/authClient";
import type { AdminUser, AdminUserQuery, AdminUserSort } from "@/types";
import { formatBytes } from "@/utils/format";
import { AdminPageHeader } from "./components/AdminPageHeader";
import { AdminUserActions } from "./components/AdminUserActions";
import { AdminUserSheet } from "./components/AdminUserSheet";
import { UserCell } from "./components/UserCell";
import { formatDate, formatRelative } from "@/utils/format";

const PAGE_SIZE = 20;
const ALL = "all";

/**
 * /admin/users — bảng người dùng: tìm (tên / email), lọc vai trò + trạng thái,
 * sắp xếp theo cột, phân trang phía server. Bộ lọc nằm trên URL (chia sẻ /
 * F5 vẫn giữ); `?user=<id>` mở panel chi tiết.
 */
export function AdminUsersView() {
  const { t, i18n } = useTranslation();
  const me = authClient.useSession().data?.user.id;
  const [params, setParams] = useSearchParams();

  const role = params.get("role") as AdminUserQuery["role"] | null;
  const status = params.get("status") as AdminUserQuery["status"] | null;
  const sort = (params.get("sort") as AdminUserSort | null) ?? "createdAt";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(0, Number(params.get("page") ?? 0) || 0);
  const openUserId = params.get("user");

  // Ô tìm kiếm giữ state riêng, chỉ đẩy lên URL sau khi ngừng gõ.
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounce(search.trim(), 300);

  const update = (patch: Record<string, string | null>, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage) next.delete("page");
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    if (debounced !== (params.get("q") ?? "")) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo ô tìm kiếm
  }, [debounced]);

  const query: AdminUserQuery = {
    q: params.get("q") ?? undefined,
    role: role ?? undefined,
    status: status ?? undefined,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: adminQueryKeys.users(query),
    queryFn: () => fetchAdminUsers(query),
    placeholderData: keepPreviousData,
  });
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : query.offset + 1;
  const to = Math.min(total, query.offset + PAGE_SIZE);

  const toggleSort = (key: AdminUserSort) =>
    update({
      sort: key,
      dir: sort === key && dir === "desc" ? "asc" : "desc",
    });
  const openUser = (id: string | null) => update({ user: id }, false);

  const SortHead = ({
    col,
    className,
    children,
  }: {
    col: AdminUserSort;
    className?: string;
    children: React.ReactNode;
  }) => {
    const Icon = sort !== col ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead
        className={className}
        aria-sort={sort === col ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            sort === col && "text-foreground",
          )}
        >
          {children}
          <Icon className="size-3.5 opacity-60" />
        </button>
      </TableHead>
    );
  };

  const roleBadge = (user: AdminUser) =>
    user.role === "admin" ? (
      <Badge>{t("admin.role.admin")}</Badge>
    ) : (
      <Badge variant="outline">{t("admin.role.user")}</Badge>
    );
  const statusBadge = (user: AdminUser) => (
    <Badge
      variant={user.banned ? "destructive" : "secondary"}
      title={user.banReason ?? undefined}
    >
      {user.banned ? t("admin.status.banned") : t("admin.status.active")}
    </Badge>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title={t("admin.nav.users")}
        subtitle={data ? t("admin.users.count", { n: total }) : undefined}
      />

      {/* Bộ lọc — xuống dòng trên màn hẹp */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users.search")}
            className="pl-9"
          />
        </div>
        <Select
          value={role ?? ALL}
          onValueChange={(v) => update({ role: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("admin.users.allRoles")}</SelectItem>
            <SelectItem value="user">{t("admin.role.user")}</SelectItem>
            <SelectItem value="admin">{t("admin.role.admin")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status ?? ALL}
          onValueChange={(v) => update({ status: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("admin.users.allStatus")}</SelectItem>
            <SelectItem value="active">{t("admin.status.active")}</SelectItem>
            <SelectItem value="banned">{t("admin.status.banned")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <p className="py-10 text-center text-sm text-destructive">
          {t("admin.error.loadFailed")}
        </p>
      ) : isPending ? (
        <Skeleton className="h-96 rounded-xl bg-muted/40" />
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 py-16 text-sm text-muted-foreground">
          <Users className="size-8 animate-float text-muted-foreground/40" />
          {t("admin.users.empty")}
        </div>
      ) : (
        <div className={cn("transition-opacity", isFetching && "opacity-60")}>
          {/* Desktop / tablet: bảng */}
          <div className="hidden overflow-hidden rounded-xl border border-border/60 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortHead col="name">{t("admin.table.user")}</SortHead>
                  <TableHead>{t("admin.table.role")}</TableHead>
                  <TableHead>{t("admin.table.status")}</TableHead>
                  <SortHead col="mediaCount" className="text-right">
                    {t("admin.table.media")}
                  </SortHead>
                  <SortHead col="storage" className="hidden text-right lg:table-cell">
                    {t("admin.table.storage")}
                  </SortHead>
                  <SortHead col="createdAt" className="hidden xl:table-cell">
                    {t("admin.table.joined")}
                  </SortHead>
                  <SortHead col="lastActive">{t("admin.table.lastActive")}</SortHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("admin.table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow
                    key={user.id}
                    className="cursor-pointer"
                    onClick={() => openUser(user.id)}
                  >
                    <TableCell className="max-w-64">
                      <UserCell name={user.name} email={user.email} image={user.image} />
                    </TableCell>
                    <TableCell>{roleBadge(user)}</TableCell>
                    <TableCell>{statusBadge(user)}</TableCell>
                    <TableCell className="text-right tabular-nums">{user.mediaCount}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {formatBytes(user.storageBytes)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {formatDate(user.createdAt, i18n.language)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelative(user.lastActiveAt, i18n.language)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <AdminUserActions user={user} isSelf={user.id === me} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: thẻ — không phải cuộn ngang bảng */}
          <ul className="space-y-2 md:hidden">
            {data.items.map((user) => (
              <li
                key={user.id}
                className="rounded-xl border border-border/60 bg-card p-3"
                onClick={() => openUser(user.id)}
              >
                <div className="flex items-start gap-2">
                  <UserCell
                    name={user.name}
                    email={user.email}
                    image={user.image}
                    className="flex-1"
                  />
                  <div onClick={(e) => e.stopPropagation()}>
                    <AdminUserActions user={user} isSelf={user.id === me} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {roleBadge(user)}
                  {statusBadge(user)}
                  <span className="ml-auto tabular-nums">
                    {t("albums.photoCount", { n: user.mediaCount })} ·{" "}
                    {formatBytes(user.storageBytes)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Phân trang */}
          <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t("admin.users.range", { from, to, total })}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page === 0}
                onClick={() => update({ page: String(page - 1) }, false)}
                aria-label={t("admin.users.prev")}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={to >= total}
                onClick={() => update({ page: String(page + 1) }, false)}
                aria-label={t("admin.users.next")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <AdminUserSheet userId={openUserId} meId={me} onClose={() => openUser(null)} />
    </div>
  );
}
