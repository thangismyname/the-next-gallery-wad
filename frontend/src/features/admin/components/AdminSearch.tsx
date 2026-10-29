import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Code2,
  LayoutDashboard,
  Loader2,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SearchTrigger } from "@/features/search/components/SearchTrigger";
import { useAdminDeveloperRequests } from "@/hooks/useAdminDeveloperRequests";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { adminQueryKeys, fetchAdminUsers } from "@/services/admin";
import type { AdminUserQuery } from "@/types";
import { UserCell } from "./UserCell";

const PAGES: { key: string; to: string; icon: LucideIcon }[] = [
  { key: "admin.nav.dashboard", to: "/admin", icon: LayoutDashboard },
  { key: "admin.nav.users", to: "/admin/users", icon: Users },
  { key: "admin.nav.developer", to: "/admin/developer", icon: Code2 },
  { key: "admin.header.backToGallery", to: "/gallery", icon: ArrowLeft },
];

const USER_LIMIT = 8;

/**
 * Tìm nhanh trong admin (⌘K): người dùng (tên / email, tìm phía server),
 * yêu cầu Developer khớp tên / email, và chuyển trang.
 */
export function AdminSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const q = useDebounce(text.trim(), 250);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  useKeyboardShortcut({ key: "k" }, toggle);

  const query: AdminUserQuery = {
    q,
    sort: "name",
    dir: "asc",
    limit: USER_LIMIT,
    offset: 0,
  };
  const users = useQuery({
    queryKey: adminQueryKeys.users(query),
    queryFn: () => fetchAdminUsers(query),
    enabled: open && q.length > 0,
    placeholderData: keepPreviousData,
  });
  const { requests } = useAdminDeveloperRequests();

  const needle = q.toLowerCase();
  const pages = PAGES.filter((p) => !needle || t(p.key).toLowerCase().includes(needle));
  const matchedRequests = needle
    ? requests
        .filter(
          (r) =>
            r.userName?.toLowerCase().includes(needle) ||
            r.userEmail.toLowerCase().includes(needle),
        )
        .slice(0, 5)
    : [];
  const userItems = q ? (users.data?.items ?? []) : [];
  const moreUsers = q && (users.data?.total ?? 0) > userItems.length;

  const go = (to: string) => {
    setOpen(false);
    setText("");
    navigate(to);
  };

  return (
    <>
      <SearchTrigger onOpen={() => setOpen(true)} />
      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setText("");
        }}
        title={t("header.search")}
        description={t("admin.search.placeholder")}
      >
        {/* Lọc phía server / tự lọc → tắt bộ lọc mờ của cmdk */}
        <Command shouldFilter={false}>
          <CommandInput
            value={text}
            onValueChange={setText}
            placeholder={t("admin.search.placeholder")}
          />
          <CommandList className="max-h-[60vh]">
            {q && users.isFetching && userItems.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("admin.loading")}
              </div>
            ) : (
              <CommandEmpty>{t("admin.search.empty")}</CommandEmpty>
            )}

            {userItems.length > 0 && (
              <CommandGroup heading={t("admin.nav.users")}>
                {userItems.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`user-${user.id}`}
                    onSelect={() => go(`/admin/users?user=${encodeURIComponent(user.id)}`)}
                  >
                    <UserCell
                      name={user.name}
                      email={user.email}
                      image={user.image}
                      className="flex-1"
                    />
                    {user.role === "admin" && <Badge>{t("admin.role.admin")}</Badge>}
                    {user.banned && (
                      <Badge variant="destructive">{t("admin.status.banned")}</Badge>
                    )}
                  </CommandItem>
                ))}
                {moreUsers && (
                  <CommandItem
                    value="user-all"
                    onSelect={() => go(`/admin/users?q=${encodeURIComponent(q)}`)}
                  >
                    <Search className="size-4" />
                    {t("admin.search.allUsers", { n: users.data?.total ?? 0, q })}
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {matchedRequests.length > 0 && (
              <CommandGroup heading={t("admin.nav.developer")}>
                {matchedRequests.map((req) => (
                  <CommandItem
                    key={req.id}
                    value={`req-${req.id}`}
                    onSelect={() =>
                      go(
                        req.status === "pending"
                          ? "/admin/developer"
                          : `/admin/developer?status=${req.status}`,
                      )
                    }
                  >
                    <Code2 className="size-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {req.userName || req.userEmail}
                    </span>
                    <Badge variant="secondary">
                      {t(`admin.developer.status.${req.status}`)}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {pages.length > 0 && (
              <CommandGroup heading={t("admin.search.pages")}>
                {pages.map(({ key, to, icon: Icon }) => (
                  <CommandItem key={to} value={`page-${to}`} onSelect={() => go(to)}>
                    <Icon className="size-4" />
                    {t(key)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
