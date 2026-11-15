import { type SmartRule } from "@tng/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalize } from "@/features/search/searchScope";
import { TAG_GROUPS, TAG_ICONS } from "@/features/studio/tagCatalog";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import { SettingOptionGroup } from "@/features/settings/components/SettingOptionGroup";

const MAX_TAGS = 3;
const MAX_LABEL_MATCHES = 24;


type ChipProps = { active: boolean; onClick: () => void; Icon: React.ElementType; name: string };

const TagChip: React.FC<ChipProps> = ({ active, onClick, Icon, name }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border/60 text-muted-foreground hover:bg-muted/50",
    )}
  >
    <Icon className="size-3.5" />
    {name}
  </button>
);

type Props = { value: SmartRule; onChange: (rule: SmartRule) => void };

/**
 * Truy vấn của album thông minh: chọn tag nội dung — 17 danh mục hoặc nhãn chi
 * tiết (tìm theo tên trong 174 nhãn) — ảnh phải có ĐỦ các tag; hoặc gõ câu như
 * ô tìm kiếm ("2 con chó trên bãi biển").
 */
export const SmartRuleFields: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const catalog = useTagCatalog();
  const [labelFilter, setLabelFilter] = useState("");
  const selected = useMemo(() => (value.type === "tags" ? value.tags : []), [value]);

  // Nhãn chi tiết: đã chọn luôn hiện; gõ để tìm thêm (tên ở ngôn ngữ đang dùng + tiếng Anh).
  const labelMatches = useMemo(() => {
    const q = normalize(labelFilter.trim());
    const chosen = catalog.labels.filter((l) => selected.includes(l.id));
    if (!q) return chosen;
    const found = catalog.labels.filter(
      (l) =>
        !selected.includes(l.id) &&
        (normalize(catalog.labelName(l)).includes(q) || normalize(l.names.en).includes(q)),
    );
    return [...chosen, ...found.slice(0, MAX_LABEL_MATCHES)];
  }, [catalog, labelFilter, selected]);

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
                {tags.map((tag) => (
                  <TagChip
                    key={tag}
                    active={value.tags.includes(tag)}
                    onClick={() => toggleTag(tag)}
                    Icon={TAG_ICONS[tag]}
                    name={t(`studio.tags.${tag}`)}
                  />
                ))}
              </div>
            ))}
            {catalog.labels.length > 0 && (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={labelFilter}
                    onChange={(e) => setLabelFilter(e.target.value)}
                    placeholder={t("albums.smart.labelFilter", { n: catalog.labels.length })}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                {labelMatches.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {labelMatches.map((label) => {
                      const display = catalog.describe(label.id)!;
                      return (
                        <TagChip
                          key={label.id}
                          active={value.tags.includes(label.id)}
                          onClick={() => toggleTag(label.id)}
                          Icon={display.Icon}
                          name={display.name}
                        />
                      );
                    })}
                  </div>
                ) : (
                  labelFilter.trim() && (
                    <p className="text-xs text-muted-foreground">{t("studio.labels.noMatch")}</p>
                  )
                )}
              </div>
            )}
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
