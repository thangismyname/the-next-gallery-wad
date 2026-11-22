// Bảng Δ + CI 95% ghép cặp.
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@tng/shared/lab";

/** Bảng Δ + CI 95% ghép cặp; hàng CI không chứa 0 = có ý nghĩa (badge). */
export function CiTable({
  rows,
}: {
  rows: { label: string; delta?: number; lo?: number; hi?: number; significant: boolean }[];
}) {
  const { t } = useTranslation();
  const f = (v?: number) => (v == null ? "—" : fmt("delta", v));
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            <th className="px-3 py-1.5 text-left font-normal">{t("lab.ci.pair")}</th>
            <th className="px-3 py-1.5 text-right font-normal">Δ</th>
            <th className="px-3 py-1.5 text-right font-normal">CI 95%</th>
            <th className="px-3 py-1.5 text-right font-normal" />
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/40">
              <td className="px-3 py-1.5 font-mono">{r.label}</td>
              <td className="px-3 py-1.5 text-right">{f(r.delta)}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">
                {f(r.lo)} … {f(r.hi)}
              </td>
              <td className="px-3 py-1.5 text-right">
                <Badge variant={r.significant ? "secondary" : "outline"} className="h-4 px-1.5 text-[10px]">
                  {t(r.significant ? "lab.ci.significant" : "lab.ci.noDiff")}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
