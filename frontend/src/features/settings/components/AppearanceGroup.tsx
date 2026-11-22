import { useTranslation } from "react-i18next";
import { Grid2x2, Grid3x3, LayoutDashboard, Languages, LayoutGrid, Monitor, Moon, Palette, Sun, Type } from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import {
  GALLERY_LAYOUTS_READY,
  LANGUAGES,
  toLanguageCode,
  useGridDensity,
  type GalleryLayout,
  type GridDensity,
  type LanguageCode,
} from "@tng/shared";
import { changeThemeWithTransition } from "@/utils/themeTransition";
import { type FontScale, useFontScale } from "@/lib/fontScale";
import { Segmented, SettingsGroup, SettingsRow } from "./SettingsGroup";

type ThemeValue = "light" | "dark" | "system";

/** Theme · language · grid density (saved in this browser) — mobile "Appearance" group + density. */
export const AppearanceGroup: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme = "system", setTheme } = useTheme();
  const density = useGridDensity((s) => s.density);
  const setDensity = useGridDensity((s) => s.setDensity);
  const layout = useGridDensity((s) => s.layout);
  const setLayout = useGridDensity((s) => s.setLayout);
  const layoutOption = (value: GalleryLayout, label: string, icon: typeof LayoutGrid) => {
    const ready = GALLERY_LAYOUTS_READY.includes(value);
    return { value, icon, disabled: !ready, hint: ready ? undefined : t("common.comingSoon"),
      label: ready ? label : `${label} · ${t("common.comingSoon")}` };
  };
  const language = toLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  const fontScale = useFontScale((s) => s.scale);
  const setFontScale = useFontScale((s) => s.setScale);

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
      <SettingsRow icon={Type} title={t("settings.appearance.fontSize")}>
        <Segmented<FontScale>
          label={t("settings.appearance.fontSize")}
          value={fontScale}
          onChange={setFontScale}
          options={[
            { value: "small", label: t("settings.appearance.fontSmall") },
            { value: "default", label: t("settings.appearance.fontDefault") },
            { value: "large", label: t("settings.appearance.fontLarge") },
            { value: "xlarge", label: t("settings.appearance.fontXLarge") },
          ]}
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
      <SettingsRow icon={LayoutDashboard} title={t("settings.appearance.layout")}>
        <Segmented<GalleryLayout>
          label={t("settings.appearance.layout")}
          value={layout}
          onChange={setLayout}
          options={[
            layoutOption("grid", t("settings.appearance.layoutGrid"), LayoutGrid),
            layoutOption("justified", t("settings.appearance.layoutJustified"), LayoutDashboard),
          ]}
        />
      </SettingsRow>
    </SettingsGroup>
  );
};
