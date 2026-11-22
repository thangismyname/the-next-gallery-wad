import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { defaultMetrics, formatValue, type MetricTable, SERIES, visibleRows } from "./labTables";


const short = (s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s);

/** 1 bảng số: chọn metric (chip), cột ngang (bar) hoặc đường theo hàng (line, cho lịch sử version);
 *  bảng dài → top / bottom 25 theo metric đầu tiên. Bảng số đầy đủ trong <details>. */
export function LabMetricChart({
  table,
  kind = "bar",
  initialMetrics,
}: {
  table: MetricTable;
  kind?: "bar" | "line";
  initialMetrics?: string[];
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() =>
    initialMetrics?.length ? initialMetrics : defaultMetrics(table),
  );
  const [mode, setMode] = useState<"top" | "bottom">("top");
  const metrics = selected.filter((m) => table.metrics.includes(m)).slice(0, SERIES.length);
  const rows = kind === "line" ? table.rows : visibleRows(table, metrics[0], mode);
  const long = kind === "bar" && rows.length < table.rows.length;

  // Tên metric có "." / "@" → không dùng làm dataKey / CSS var, đổi sang m0, m1…
  const config = Object.fromEntries(
    metrics.map((m, i) => [`m${i}`, { label: m, color: SERIES[i] }]),
  ) satisfies ChartConfig;
  const data = rows.map((r) => ({
    label: r.label,
    ...Object.fromEntries(metrics.map((m, i) => [`m${i}`, r.values[m] ?? null])),
  }));
  const toggle = (m: string) =>
    setSelected((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {table.metrics.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            aria-pressed={metrics.includes(m)}
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
              metrics.includes(m)
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {long && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["top", "bottom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded px-1.5 py-0.5", mode === m && "bg-muted text-foreground")}
            >
              {t(`lab.${m}`, { count: rows.length })}
            </button>
          ))}
          <span>
            {t("lab.ofRows", { metric: metrics[0], total: table.rows.length })}
          </span>
        </div>
      )}

      {metrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("lab.pickMetric")}</p>
      ) : kind === "line" ? (
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <LineChart data={data} margin={{ left: 0, right: 12 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {metrics.map((_, i) => (
              <Line
                key={i}
                dataKey={`m${i}`}
                type="monotone"
                stroke={`var(--color-m${i})`}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ChartContainer>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: rows.length * Math.max(22, metrics.length * 12 + 10) + 56 }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={170}
              interval={0}
              tickFormatter={short}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            {metrics.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {metrics.map((_, i) => (
              <Bar key={i} dataKey={`m${i}`} fill={`var(--color-m${i})`} radius={3} />
            ))}
          </BarChart>
        </ChartContainer>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
          {t("lab.showTable", { count: table.rows.length })}
        </summary>
        <div className="mt-2 max-h-96 overflow-auto rounded-md border border-border/60">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="px-2 py-1 text-left font-normal text-muted-foreground" />
                {table.metrics.map((m) => (
                  <th key={m} className="px-2 py-1 text-right font-normal whitespace-nowrap text-muted-foreground">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/40">
                  <td className="px-2 py-1 whitespace-nowrap">{r.label}</td>
                  {table.metrics.map((m) => (
                    <td key={m} className="px-2 py-1 text-right tabular-nums">
                      {formatValue(r.values[m])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
