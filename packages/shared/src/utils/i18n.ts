import type { UserLabelDto } from "../services/labels";

/** i18next `t` as the shared helpers need it (shared has no i18next dependency). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** User's own label name, or the suggested label's name in the current language. */
export function labelDisplayName(label: UserLabelDto, t: Translate) {
  return label.name ?? t(`favorites.labels.suggested.${label.preset}`, { defaultValue: label.preset ?? "" });
}
