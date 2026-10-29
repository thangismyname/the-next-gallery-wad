import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Grid2x2, Grid3x3, LayoutGrid, Monitor, Moon, Sun } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useGridDensity, type GridDensity } from "@/hooks/useGridDensity";
import { LANGUAGES, toLanguageCode, type LanguageCode } from "@/lib/languages";
import { changeThemeWithTransition } from "@/utils/themeTransition";
import { SettingOptionGroup } from "./SettingOptionGroup";

type ThemeValue = "light" | "dark" | "system";

/** Chủ đề sáng/tối, ngôn ngữ, mật độ lưới ảnh — lưu ở trình duyệt. */
export const AppearanceCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme = "system", setTheme } = useTheme();
  const density = useGridDensity((s) => s.density);
  const setDensity = useGridDensity((s) => s.setDensity);
  const language = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
        <CardDescription>{t("settings.appearance.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SettingOptionGroup<ThemeValue>
          label={t("settings.appearance.theme")}
          value={theme as ThemeValue}
          onChange={(next, origin) => {
            if (next === theme) return;
            changeThemeWithTransition(() => setTheme(next), origin);
          }}
          options={[
            {
              value: "light",
              label: t("settings.appearance.light"),
              icon: Sun,
            },
            { value: "dark", label: t("settings.appearance.dark"), icon: Moon },
            {
              value: "system",
              label: t("settings.appearance.system"),
              icon: Monitor,
            },
          ]}
        />
        <SettingOptionGroup<LanguageCode>
          label={t("settings.appearance.language")}
          value={language}
          onChange={(lng) => void i18n.changeLanguage(lng)}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
        <SettingOptionGroup<GridDensity>
          label={t("settings.appearance.density")}
          value={density}
          onChange={setDensity}
          options={[
            {
              value: "compact",
              label: t("settings.appearance.compact"),
              icon: Grid3x3,
            },
            {
              value: "comfortable",
              label: t("settings.appearance.comfortable"),
              icon: LayoutGrid,
            },
            {
              value: "large",
              label: t("settings.appearance.large"),
              icon: Grid2x2,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
};
