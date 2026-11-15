import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KeyRound, LogOut, Shield, UserRound } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/services/authClient";
import { useLogout } from "@/features/navigation/useLogout";
import { ProfileSummary } from "@/features/profile/components/ProfileSummary";
import { EditProfileForm } from "@/features/profile/components/EditProfileForm";
import { ChangePasswordForm } from "@/features/profile/components/ChangePasswordForm";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";
import { AppearanceGroup } from "./AppearanceGroup";
import { StorageGroup } from "./StorageGroup";
import { AiProcessingGroup } from "./AiProcessingGroup";
import { SessionsGroup } from "./SessionsGroup";
import { DeveloperGroup } from "./DeveloperGroup";

/**
 * Account & settings content — same structure as the mobile account sheet:
 * account card + stats · Account (edit profile / change password in dialogs,
 * admin dashboard) · Appearance · Storage + trash · AI processing · Developer
 * Mode · signed-in devices · sign out. Used by the `/settings` page and the
 * avatar's bottom sheet (`AccountSheet`).
 */
export function AccountPanel() {
  const { t } = useTranslation();
  const { logout } = useLogout();
  const { data: session, isPending, refetch } = authClient.useSession();
  const user = session?.user;
  const [dialog, setDialog] = useState<"profile" | "password" | null>(null);

  // Linked sign-in methods — "Change password" only for email/password accounts.
  const { data: providers = [] } = useQuery({
    queryKey: ["profile", "accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message);
      return (data ?? []).map((a) => a.providerId);
    },
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const hasPassword = providers.includes("credential");

  return (
    <Fragment>
      <div className="space-y-7">
        {isPending || !user ? (
          <Skeleton className="h-56 rounded-2xl bg-muted/40" />
        ) : (
          <ProfileSummary
            name={user.name}
            email={user.email}
            image={user.image}
            createdAt={user.createdAt}
            emailVerified={user.emailVerified}
            role={user.role}
            providers={providers}
          />
        )}

        <SettingsGroup
          title={t("header.account")}
          footer={
            !hasPassword && providers.length > 0
              ? t("profile.noPassword")
              : undefined
          }
        >
          <SettingsRow
            icon={UserRound}
            title={t("profile.infoTitle")}
            subtitle={t("profile.infoDesc")}
            trailing={
              <Button variant="outline" size="sm" className="shrink-0" disabled={!user} onClick={() => setDialog("profile")}>
                {t("profile.edit")}
              </Button>
            }
          />
          {hasPassword && (
            <SettingsRow
              icon={KeyRound}
              title={t("profile.passwordTitle")}
              subtitle={t("profile.passwordDesc")}
              trailing={
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setDialog("password")}>
                  {t("profile.changePassword")}
                </Button>
              }
            />
          )}
          {user?.role === "admin" && (
            <SettingsRow
              icon={Shield}
              title={t("header.admin")}
              trailing={
                <Button variant="outline" size="sm" className="shrink-0" asChild>
                  <Link to="/admin">{t("common.open")}</Link>
                </Button>
              }
            />
          )}
        </SettingsGroup>

        <AppearanceGroup />
        <StorageGroup />
        <AiProcessingGroup />
        <DeveloperGroup />
        <SessionsGroup />

        <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={logout}>
          <LogOut className="size-4" />
          {t("header.logout")}
        </Button>
      </div>

      <Dialog
        open={dialog === "profile"}
        onOpenChange={(open) => setDialog(open ? "profile" : null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("profile.infoTitle")}</DialogTitle>
            <DialogDescription>{t("profile.infoDesc")}</DialogDescription>
          </DialogHeader>
          {/* DialogContent has no padding of its own — the body gives the side margins. */}
          <DialogBody className="pb-6">
            {user && (
              <EditProfileForm
                name={user.name}
                email={user.email}
                image={user.image}
                onSaved={() => {
                  void refetch();
                  setDialog(null);
                }}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "password"}
        onOpenChange={(open) => setDialog(open ? "password" : null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("profile.passwordTitle")}</DialogTitle>
            <DialogDescription>{t("profile.passwordDesc")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-6">
            <ChangePasswordForm />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
