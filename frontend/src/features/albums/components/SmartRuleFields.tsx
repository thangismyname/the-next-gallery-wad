import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SmartRule } from "@/services/albums";
import { TAG_GROUPS, TAG_ICONS } from "@/features/studio/tagCatalog";
import { SettingOptionGroup } from "@/features/settings/components/SettingOptionGroup";

const MAX_TAGS = 3;

type Props = { value: SmartRule; onChange: (rule: SmartRule) => void };

/**
 * Truy vấn của album thông minh: chọn tag nội dung (ảnh phải có ĐỦ các tag)
 * hoặc gõ câu như ô tìm kiếm ("2 con chó trên bãi biển").
 */
export const SmartRuleFields: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const toggleTag = (tag: string) => {
    if (value.type !== "tags") return;
    const tags = value.tags.includes(tag)
      ? value.tags.filter((x) => x !== tag)
      : [...value.tags, tag].slice(-MAX_TAGS);
    onChange({ ...value, tags });
  };

  return (
    <div className="space-y-3">
      <SettingOptionGroup<SmartRule["type"]>
        label={t("albums.smart.ruleType")}
        value={value.type}
        onChange={(type) =>
          onChange(
            type === "tags"
              ? { type, tags: [], minConfidence: null }
              : { type, query: "" },
          )
        }
        options={[
          { value: "tags", label: t("albums.smart.byTags") },
          { value: "query", label: t("albums.smart.byQuery") },
        ]}
      />

      {value.type === "tags" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("albums.smart.tagsHint", { max: MAX_TAGS })}
          </p>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {TAG_GROUPS.map(({ group, tags }) => (
              <div key={group} className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const Icon = TAG_ICONS[tag];
                  const active = value.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {t(`studio.tags.${tag}`)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="smart-query">{t("albums.smart.query")}</Label>
          <Input
            id="smart-query"
            value={value.query}
            maxLength={120}
            placeholder={t("albums.smart.queryPlaceholder")}
            onChange={(e) => onChange({ type: "query", query: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {t("albums.smart.queryHint")}
          </p>
        </div>
      )}
    </div>
  );
};
