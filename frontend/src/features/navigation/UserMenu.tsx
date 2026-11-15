import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/services/authClient";
import { getInitials } from "@tng/shared";
import { AccountSheet } from "@/features/settings/AccountSheet";

/**
 * Header avatar → account sheet (slides up like the mobile app): profile +
 * settings + Developer Mode + admin + sign out in one place (`AccountSheet`).
 */
export function UserMenu() {
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isPending}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
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
        </TooltipTrigger>
        <TooltipContent>{t("header.accountSettings")}</TooltipContent>
      </Tooltip>
      <AccountSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
