import React from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { AccountPanel } from "./components/AccountPanel";

/**
 * `/settings` page (`/profile` redirects here) — the same content as the avatar's
 * bottom sheet (`AccountSheet`), for direct links.
 */
export const AccountView: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("header.accountSettings")}
          </h1>
          <p className="text-xs text-muted-foreground">{t("settings.accountSubtitle")}</p>
        </div>
      </div>
      <AccountPanel />
    </div>
  );
};
