import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LogOut, Settings, User, Code2, Shield } from "lucide-react";
import { authClient } from "@/services/authClient";
import { useLogout } from "@/hooks/useLogout";
import { getInitials } from "@/utils/string";
import { DeveloperModeDialog } from "@/features/developer/DeveloperModeDialog";

export function UserMenu() {
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();
  const { logout } = useLogout();
  const [devDialogOpen, setDevDialogOpen] = useState(false);
  const user = session?.user;

  return (
    <>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isPending}
            >
              <Avatar className="h-9 w-9 cursor-pointer">
                <AvatarImage
                  src={user?.image ?? undefined}
                  alt={user?.name ?? t("header.userAvatarAlt", "User avatar")}
                />
                <AvatarFallback>
                  {isPending ? "…" : getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("header.account", "Account")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-none">
            {user?.name ?? t("header.guest", "Guest")}
          </span>
          {user?.email && (
            <span className="text-xs font-normal text-muted-foreground truncate">
              {user.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="mr-2 h-4 w-4" />
            {t("header.profile", "Profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" />
            {t("header.settings", "Settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setDevDialogOpen(true)}
        >
          <Code2 className="mr-2 h-4 w-4" />
          {t("developer.menuItem", "Developer Mode")}
        </DropdownMenuItem>
        {user?.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <Shield className="mr-2 h-4 w-4" />
              {t("header.admin", "Admin dashboard")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("header.logout", "Log out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DeveloperModeDialog open={devDialogOpen} onOpenChange={setDevDialogOpen} />
    </>
  );
}
