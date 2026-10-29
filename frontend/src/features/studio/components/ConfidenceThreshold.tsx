import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Props = {
  /** null = ngưỡng tự động của tag. */
  value: number | null;
  autoValue: number;
  onChange: (value: number | null) => void;
};

/**
 * Thanh trượt ngưỡng tin cậy: kéo lên → chỉ còn ảnh model chắc chắn (precision
 * cao), kéo xuống → thêm ảnh nhưng dễ sai (recall cao).
 */
export const ConfidenceThreshold: React.FC<Props> = ({
  value,
  autoValue,
  onChange,
}) => {
  const { t } = useTranslation();
  const effective = value ?? autoValue;

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">{t("studio.threshold")}</span>
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.05}
          value={effective}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 accent-primary sm:w-36"
        />
        <span className="w-9 text-right font-medium text-foreground tabular-nums">
          {Math.round(effective * 100)}%
        </span>
      </label>
      <Button
        variant={value === null ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange(null)}
        title={t("studio.thresholdAutoHint")}
      >
        {t("studio.thresholdAuto")}
      </Button>
    </div>
  );
};
