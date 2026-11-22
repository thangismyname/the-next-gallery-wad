// Thẻ chỉ số + lưới hairline.
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Line, LineChart, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <LineChart width={72} height={24} data={values.map((v) => ({ v }))}>
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line dataKey="v" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}

/** 1 ô chỉ số: nhãn mono + badge đạt/chưa · tiêu đề · số lớn (+ sparkline) · câu phụ. Có onClick → là nút. */
export function StatTile({
  tag,
  title,
  value,
  sub,
  pass,
  spark,
  onClick,
}: {
  tag?: string;
  title: string;
  value: string;
  sub?: React.ReactNode;
  pass?: boolean;
  spark?: number[];
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group flex min-h-28 flex-col gap-1 bg-card px-4 py-3 text-left",
        onClick && "transition-colors hover:bg-muted/40",
      )}
    >
      <div className="flex min-h-4 items-center gap-2">
        {tag && <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{tag}</span>}
        {pass != null && (
          <Badge variant={pass ? "secondary" : "outline"} className="h-4 px-1.5 text-[10px]">
            {t(pass ? "lab.overview.pass" : "lab.overview.fail")}
          </Badge>
        )}
        {onClick && (
          <ArrowRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="flex items-end justify-between gap-2">
        <span className="font-heading text-2xl tabular-nums">{value}</span>
        {spark && <Sparkline values={spark} />}
      </div>
      {sub && <div className="text-[11px] leading-snug text-muted-foreground">{sub}</div>}
    </Comp>
  );
}

const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/** Lưới hairline cho StatTile. `cols` = số cột từ sm (mặc định = số ô, ≤ 4); `stacked` = 1 cột trên lg (cạnh chart). */
export function TileGrid({ count, stacked, children }: { count: number; stacked?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid content-start gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60",
        stacked ? "sm:grid-cols-2 lg:grid-cols-1" : COLS[Math.min(count, 4)],
      )}
    >
      {children}
    </div>
  );
}
