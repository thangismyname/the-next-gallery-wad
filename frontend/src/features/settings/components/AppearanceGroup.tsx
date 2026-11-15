import { useTranslation } from "react-i18next";
import { Grid2x2, Grid3x3, Languages, LayoutGrid, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { LANGUAGES, toLanguageCode, useGridDensity, type GridDensity, type LanguageCode } from "@tng/shared";
import { changeThemeWithTransition } from "@/utils/themeTransition";
import { Segmented, SettingsGroup, SettingsRow } from "./SettingsGroup";

type ThemeValue = "light" | "dark" | "system";

/** Theme · language · grid density (saved in this browser) — mobile "Appearance" group + density. */
export const AppearanceGroup: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme = "system", setTheme } = useTheme();
  const density = useGridDensity((s) => s.density);
  const setDensity = useGridDensity((s) => s.setDensity);
  const language = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  return (
    <SettingsGroup title={t("settings.appearance.title")} footer={t("settings.appearance.desc")}>
      <SettingsRow icon={Palette} title={t("settings.appearance.theme")}>
        <Segmented<ThemeValue>
          label={t("settings.appearance.theme")}
          value={theme as ThemeValue}
          onChange={(next, origin) => {
            if (next !== theme) changeThemeWithTransition(() => setTheme(next), origin);
          }}
          options={[
            { value: "system", label: t("settings.appearance.system"), icon: Monitor },
            { value: "light", label: t("settings.appearance.light"), icon: Sun },
            { value: "dark", label: t("settings.appearance.dark"), icon: Moon },
          ]}
        />
      </SettingsRow>
      <SettingsRow icon={Languages} title={t("settings.appearance.language")}>
        <Segmented<LanguageCode>
          label={t("settings.appearance.language")}
          value={language}
          onChange={(lng) => void i18n.changeLanguage(lng)}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
      </SettingsRow>
      <SettingsRow icon={LayoutGrid} title={t("settings.appearance.density")}>
        <Segmented<GridDensity>
          label={t("settings.appearance.density")}
          value={density}
          onChange={setDensity}
          options={[
            { value: "compact", label: t("settings.appearance.compact"), icon: Grid3x3 },
            { value: "comfortable", label: t("settings.appearance.comfortable"), icon: LayoutGrid },
            { value: "large", label: t("settings.appearance.large"), icon: Grid2x2 },
          ]}
        />
      </SettingsRow>
    </SettingsGroup>
  );
};
