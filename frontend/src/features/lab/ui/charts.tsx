// Biểu đồ dùng chung: cột ngang (màu theo hàng), cột Δ hai phía, đường.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  type LabelProps,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { Tone } from "@tng/shared/lab";
import { fmt } from "@tng/shared/lab";
import { toneColor } from "../colors";

export interface Series<Row> {
  key: string;
  label: string;
  /** Màu từng hàng (theo nguồn) hoặc cố định cho cả series. */
  color: (row: Row) => string;
  opacity?: number;
  format?: (v: number) => string;
}

/** Màu đã pha độ mờ (thay cho fillOpacity) — để ô màu của legend giống hệt cột. */
const tint = (color: string, opacity = 1) =>
  opacity >= 1 ? color : `color-mix(in oklch, ${color} ${Math.round(opacity * 100)}%, transparent)`;

/** Cột ngang, màu theo từng hàng; số ghi ở đầu cột. `legend` khi màu theo series (không theo hàng). */
export function HBars<Row extends { label: string }>({
  data,
  series,
  domain,
  perRow = 30,
  labelWidth = 110,
  legend,
  stacked,
}: {
  data: Row[];
  series: Series<Row>[];
  domain?: [number, number];
  perRow?: number;
  labelWidth?: number;
  legend?: boolean;
  /** Cột chồng (vd số tag theo quy tắc): số ghi trong từng đoạn, ẩn đoạn = 0. */
  stacked?: boolean;
}) {
  // Legend lấy màu từ `fill` của <Bar> (Cell không tính) → fill = màu hàng đầu, chỉ đúng khi mỗi series 1 màu.
  const legendColor = (s: Series<Row>) => (data[0] ? tint(s.color(data[0]), s.opacity) : undefined);
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: legendColor(s) }])) satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: data.length * perRow + (legend ? 64 : 40) }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" domain={domain} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          interval={0}
          tickLine={false}
          axisLine={false}
          className="font-mono"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {legend && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={legendColor(s)}
            radius={stacked ? 0 : 3}
            stackId={stacked ? "stack" : undefined}
          >
            {data.map((row) => (
              <Cell key={row.label} fill={tint(s.color(row), s.opacity)} />
            ))}
            <LabelList
              dataKey={s.key}
              position={stacked ? "inside" : "right"}
              formatter={(v: unknown) =>
                typeof v === "number" && !(stacked && v === 0) ? (s.format ?? ((x) => fmt("value", x)))(v) : ""
              }
              className="fill-foreground text-[10px]"
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Nhãn Δ ở đầu cột lệch: bên phải cột dương, bên trái cột âm. */
function DeltaLabel({ x, y, width, height, value }: LabelProps) {
  if (typeof value !== "number") return null;
  const [x0, w, y0, h] = [x, width, y, height].map(Number);
  const pos = value >= 0;
  return (
    <text
      x={pos ? Math.max(x0, x0 + w) + 4 : Math.min(x0, x0 + w) - 4}
      y={y0 + h / 2}
      dy="0.35em"
      textAnchor={pos ? "start" : "end"}
      className="fill-foreground text-[10px]"
    >
      {fmt("delta", value)}
    </text>
  );
}

/** Cột lệch hai phía quanh 0 (Δ), trục đối xứng; `tolerance` → dải xám ±tolerance = vùng đạt. */
export function DeltaBars({
  data,
  label,
  tolerance,
  perRow = 30,
  labelWidth = 130,
}: {
  /** `color` (web) hoặc `tone` (từ @tng/shared/lab). */
  data: { label: string; delta?: number; color?: string; tone?: Tone }[];
  label: string;
  tolerance?: number;
  perRow?: number;
  labelWidth?: number;
}) {
  const max = Math.max(tolerance ?? 0, ...data.map((d) => Math.abs(d.delta ?? 0)));
  const m = max > 0 ? +(max * 1.35).toFixed(2) : 1;
  return (
    <ChartContainer
      config={{ delta: { label } } satisfies ChartConfig}
      className="aspect-auto w-full"
      style={{ height: data.length * perRow + 40 }}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        {tolerance != null && (
          <ReferenceArea x1={-tolerance} x2={tolerance} fill="var(--muted-foreground)" fillOpacity={0.12} />
        )}
        <ReferenceLine x={0} stroke="var(--foreground)" strokeOpacity={0.6} />
        <XAxis type="number" domain={[-m, m]} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={labelWidth}
          interval={0}
          tickLine={false}
          axisLine={false}
          className="font-mono"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* Chỉ bo đầu ngoài: góc [0] / [3] nằm ở gốc 0 (recharts tính góc từ x, cả khi width âm) */}
        <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.color ?? toneColor(row.tone ?? "clip")} />
          ))}
          <LabelList dataKey="delta" content={DeltaLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Đường (1 màu / series). `xType="number"` + `diagonal` → reliability diagram (đường chéo y = x = hiệu chỉnh hoàn hảo). */
export function Lines<Row extends Record<string, unknown>>({
  data,
  series,
  xKey = "label",
  xType = "category",
  xDomain,
  yDomain = [0, 1],
  diagonal,
  height = 260,
}: {
  data: Row[];
  series: { key: string; label: string; color: string; dashed?: boolean }[];
  xKey?: string;
  xType?: "category" | "number";
  xDomain?: [number, number];
  yDomain?: [number, number];
  diagonal?: boolean;
  height?: number;
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} type={xType} domain={xDomain} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis domain={yDomain} tickLine={false} axisLine={false} width={40} />
        {diagonal && (
          <ReferenceLine
            segment={[
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ]}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
        )}
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={{ r: 3, fill: s.color }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
