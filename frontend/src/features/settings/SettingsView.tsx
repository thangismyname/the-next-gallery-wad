import React from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { AppearanceCard } from "./components/AppearanceCard";
import { SessionsCard } from "./components/SessionsCard";
import { AiProcessingCard } from "./components/AiProcessingCard";
import { StorageCard } from "./components/StorageCard";

/**
 * Trang cài đặt: giao diện (theme / ngôn ngữ / mật độ lưới), thiết bị đăng
 * nhập, tiến độ xử lý AI + Developer Mode, dung lượng + thùng rác. Thông tin
 * cá nhân (tên, avatar, mật khẩu) nằm ở trang hồ sơ.
 */
export const SettingsView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("settings.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("settings.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <AppearanceCard />
        <StorageCard />
        <AiProcessingCard />
        <SessionsCard />
      </div>
    </div>
  );
};
