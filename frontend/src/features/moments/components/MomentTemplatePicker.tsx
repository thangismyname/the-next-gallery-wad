import { useTranslation } from "react-i18next";
import { MomentTemplate } from "@/types";
import { cn } from "@/lib/utils";

export type MomentCreateMode = "self" | "collab";

type Props = {
  template: MomentTemplate;
  onTemplateChange: (template: MomentTemplate) => void;
  mode: MomentCreateMode;
  onModeChange: (mode: MomentCreateMode) => void;
  /** Edit draft: chỉ cho template ghép nhiều ảnh, không đổi chế độ. */
  isEditing: boolean;
};

const TEMPLATES: {
  template: MomentTemplate;
  cells: number;
  titleKey: string;
  descKey: string;
}[] = [
  {
    template: "single",
    cells: 1,
    titleKey: "moments.templateSingle",
    descKey: "moments.templateSingleDesc",
  },
  {
    template: "duo_square",
    cells: 2,
    titleKey: "moments.templateDuo",
    descKey: "moments.templateDuoDesc",
  },
  {
    template: "trio_wide",
    cells: 3,
    titleKey: "moments.templateTrio",
    descKey: "moments.templateTrioDesc",
  },
];

/**
 * Bước 1 + 2 của dialog tạo moment: chọn template (ảnh minh hoạ số ô) và,
 * với duo/trio khi tạo mới, chế độ "Cùng bạn" / "Một mình".
 */
export const MomentTemplatePicker: React.FC<Props> = ({
  template,
  onTemplateChange,
  mode,
  onModeChange,
  isEditing,
}) => {
  const { t } = useTranslation();
  const isCollabTemplate = template !== "single";

  return (
    <>
      <div className="flex gap-2">
        {TEMPLATES.filter((x) => !isEditing || x.template !== "single").map(
          ({ template: value, cells, titleKey, descKey }) => {
            const active = template === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onTemplateChange(value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition hover:bg-muted/40",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border",
                )}
              >
                <div
                  className={cn(
                    "grid w-full max-w-[92px] gap-1",
                    value === "single" && "grid-rows-1",
                    value !== "single" && "grid-cols-1 aspect-[4/5]",
                    value === "duo_square" && "grid-rows-2",
                    value === "trio_wide" && "grid-rows-3",
                  )}
                >
                  {Array.from({ length: cells }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded-[3px] bg-muted",
                        value === "single" && "aspect-[4/5]",
                        active && "bg-primary/15",
                      )}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium leading-tight">
                  {t(titleKey)}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {t(descKey)}
                </span>
              </button>
            );
          },
        )}
      </div>

      {isCollabTemplate && !isEditing && (
        <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1 text-xs">
          {(["collab", "self"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 transition",
                mode === value
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {t(value === "collab" ? "moments.modeCollab" : "moments.modeSelf")}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
