// Chú thích màu cho từng biểu đồ (chỉ các màu biểu đồ đó dùng).
import { useTranslation } from "react-i18next";
import { SourceKind } from "@tng/shared/lab";
import { FAIL_COLOR, KIND_COLOR, MUTED } from "../colors";

/** Ô màu + nhãn (chú thích của 1 biểu đồ). */
export function Swatches({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Màu nguồn AI — chỉ các nguồn biểu đồ đó dùng. */
export function KindLegend({ kinds }: { kinds: SourceKind[] }) {
  const { t } = useTranslation();
  return <Swatches items={kinds.map((kind) => ({ color: KIND_COLOR[kind], label: t(`lab.overview.kinds.${kind}`) }))} />;
}

/** Biểu đồ Δ có dải ±tolerance (E1): trong dải / ngoài dải / vùng đạt. */
export function ToleranceLegend({ tol }: { tol: number }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`lab.digest.e1.legend.${key}`, { tol });
  return (
    <Swatches
      items={[
        { color: KIND_COLOR.clip, label: k("within") },
        { color: FAIL_COLOR, label: k("outside") },
        { color: "color-mix(in oklch, var(--muted-foreground) 25%, transparent)", label: k("band") },
      ]}
    />
  );
}

/** Chú thích cột Δ có CI: màu nguồn = có ý nghĩa, xám = CI chứa 0. */
export function CiLegend({ kinds }: { kinds: SourceKind[] }) {
  const { t } = useTranslation();
  return (
    <Swatches
      items={[
        ...kinds.map((kind) => ({
          color: KIND_COLOR[kind],
          label: t("lab.ci.legendSignificant", { source: t(`lab.overview.kinds.${kind}`) }),
        })),
        { color: MUTED, label: t("lab.ci.legendNoDiff") },
      ]}
    />
  );
}
