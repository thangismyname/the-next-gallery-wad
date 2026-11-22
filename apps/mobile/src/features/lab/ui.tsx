// Khối giao diện Lab trên mobile — cùng vai trò với web `features/lab/ui/` (StatTile/TileGrid, Step, ChartCard,
// HBars, DeltaBars, Lines, CiTable, legends). Cột ngang + cột Δ dựng bằng View (chữ dài xuống dòng trên màn hẹp);
// chỉ biểu đồ đường dùng react-native-svg.
import { fmt, type SourceKind, type Tone } from "@tng/shared/lab";
import { ChevronRight } from "lucide-react-native";
import { Children, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Polyline } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { AdminBadge, SECTION_LABEL } from "@/features/admin/components/AdminUi";
import { useTextFactor } from "@/hooks/useFontScale";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/utils";

import { useLabColors } from "./labColors";

// ── Thẻ chỉ số ──

export function StatTile({
  tag,
  title,
  value,
  sub,
  pass,
  spark,
  onPress,
}: {
  tag?: string;
  title: string;
  value: string;
  sub?: ReactNode;
  pass?: boolean;
  /** Giá trị qua các version (History/summary) → đường nhỏ cạnh số. */
  spark?: number[];
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const f = useTextFactor();
  const [w, setW] = useState(0);
  // Số (~2.8em ở 26px) + sparkline 64 + padding 28 không vừa → bỏ sparkline (SE, màn ngoài Z Fold, chữ to).
  const showSpark = spark && spark.length > 1 && w >= 28 + 64 + 2.8 * 26 * f;
  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "link" : undefined}
      className={cn("min-w-0 flex-1 gap-1 bg-card p-3.5", onPress && "active:bg-muted")}
    >
      {/* minHeight = cao bằng badge (theo cỡ chữ) → thẻ có / không có badge thẳng hàng nhau */}
      <View className="flex-row items-center gap-1.5" style={{ minHeight: 20 * f }}>
        {tag ? (
          <Text numberOfLines={1} className={cn(SECTION_LABEL, "shrink text-[10px]")}>
            {tag}
          </Text>
        ) : null}
        {pass != null ? (
          <AdminBadge label={t(pass ? "lab.overview.pass" : "lab.overview.fail")} variant={pass ? "secondary" : "outline"} />
        ) : null}
        {onPress ? <Icon as={ChevronRight} size={14} className="ml-auto text-muted-foreground" /> : null}
      </View>
      {/* flex-1: tiêu đề dài (2 dòng) không đẩy số lệch so với thẻ bên cạnh — số + sub dồn xuống đáy */}
      <Text className="flex-1 text-xs text-muted-foreground">{title}</Text>
      <View className="flex-row items-end justify-between gap-2">
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} className="shrink font-heading text-[26px] tabular-nums">
          {value}
        </Text>
        {showSpark ? <Sparkline values={spark} /> : null}
      </View>
      {sub ? <Text className="text-[11px] leading-snug text-muted-foreground">{sub}</Text> : null}
    </Pressable>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const c = useLabColors();
  const [w, h] = [56, 20];
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - lo) / span) * (h - 4)}`).join(" ");
  return (
    <Svg width={w} height={h}>
      <Polyline points={pts} fill="none" stroke={c.muted} strokeWidth={1.5} />
    </Svg>
  );
}

/** Lưới hairline cho StatTile: 2 cột, tới `max` khi khung ≥ 700pt (tablet, Z Fold mở — không phải điện thoại xoay
 *  ngang: 4 thẻ ~150pt thì số bị cắt); hàng cuối thiếu ô thì các ô còn lại giãn ra lấp đầy (không để ô trống). */
export function TileGrid({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const { width } = useLayout();
  const tiles = Children.toArray(children);
  const cols = Math.max(1, Math.min(tiles.length, width - 32 >= 700 ? max : 2));
  const rows = Array.from({ length: Math.ceil(tiles.length / cols) }, (_, r) => tiles.slice(r * cols, r * cols + cols));
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-border" style={{ gap: 1 }}>
      {rows.map((row, r) => (
        <View key={r} className="flex-row" style={{ gap: 1 }}>
          {row}
        </View>
      ))}
    </View>
  );
}

// ── Bước + card ──

export function StepHeader({ index, title, question }: { index?: number; title: string; question?: string }) {
  return (
    <View className="flex-row items-baseline gap-3 border-b border-border pb-2">
      {index != null ? <Text className="font-heading text-2xl tabular-nums text-muted-foreground">{index}</Text> : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-heading text-lg">{title}</Text>
        {question ? <Text className="text-xs text-muted-foreground">{question}</Text> : null}
      </View>
    </View>
  );
}

/** 1 bước của tóm tắt: StepHeader (i18n `<base>.title` / `<base>.question`) + nội dung. */
export function Step({
  index,
  base,
  params,
  children,
}: {
  index: number;
  base: string;
  params?: Record<string, unknown>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <StepHeader index={index} title={t(`${base}.title`)} question={t(`${base}.question`, params ?? {})} />
      {children}
    </View>
  );
}

export function ChartCard({
  title,
  caption,
  legend,
  onOpen,
  children,
}: {
  title: string;
  caption?: string;
  legend?: ReactNode;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className={cn(SECTION_LABEL, "shrink")}>{title}</Text>
          {onOpen ? (
            <Pressable onPress={onOpen} hitSlop={8} className="flex-row items-center gap-0.5 active:opacity-60">
              <Text className="text-xs text-muted-foreground">{t("lab.overview.open")}</Text>
              <Icon as={ChevronRight} size={14} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>
        {caption ? <Text className="text-xs text-muted-foreground">{caption}</Text> : null}
        {legend}
      </View>
      {children}
    </View>
  );
}

// ── Chú thích màu ──

export function Swatches({ items }: { items: { color: string; label: string; opacity?: number }[] }) {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View className="size-2.5 rounded-sm" style={{ backgroundColor: item.color, opacity: item.opacity ?? 1 }} />
          <Text className="text-xs text-muted-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Màu nguồn AI — chỉ các nguồn biểu đồ đó dùng (web `KindLegend`). */
export function KindLegend({ kinds }: { kinds: SourceKind[] }) {
  const { t } = useTranslation();
  const c = useLabColors();
  return <Swatches items={kinds.map((kind) => ({ color: c.tone(kind), label: t(`lab.overview.kinds.${kind}`) }))} />;
}

/** Biểu đồ Δ có dải ±tolerance (E1): trong dải / ngoài dải / vùng đạt. */
export function ToleranceLegend({ tol }: { tol: number }) {
  const { t } = useTranslation();
  const c = useLabColors();
  const k = (key: string) => t(`lab.digest.e1.legend.${key}`, { tol });
  return (
    <Swatches
      items={[
        { color: c.tone("clip"), label: k("within") },
        { color: c.fail, label: k("outside") },
        { color: c.muted, label: k("band"), opacity: 0.25 },
      ]}
    />
  );
}

/** Cột Δ có CI: màu nguồn = có ý nghĩa, xám = CI chứa 0. */
export function CiLegend({ kinds }: { kinds: SourceKind[] }) {
  const { t } = useTranslation();
  const c = useLabColors();
  return (
    <Swatches
      items={[
        ...kinds.map((kind) => ({
          color: c.tone(kind),
          label: t("lab.ci.legendSignificant", { source: t(`lab.overview.kinds.${kind}`) }),
        })),
        { color: c.muted, label: t("lab.ci.legendNoDiff") },
      ]}
    />
  );
}

// ── Cột ngang ──

export interface Series<Row> {
  key: string;
  label: string;
  color: (row: Row) => string;
  opacity?: number;
  format?: (v: number) => string;
}

const valueOf = (row: object, key: string) => {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

/** Mỗi hàng: nhãn, rồi 1 thanh / series (số ở cuối thanh). `stacked` = các series nối nhau trên 1 thanh. */
export function HBars<Row extends { label: string }>({
  data,
  series,
  domain,
  legend,
  stacked,
}: {
  data: Row[];
  series: Series<Row>[];
  domain?: [number, number];
  legend?: boolean;
  stacked?: boolean;
}) {
  const values = data.map((row) =>
    stacked
      ? series.reduce((sum, s) => sum + (valueOf(row, s.key) ?? 0), 0)
      : Math.max(0, ...series.map((s) => valueOf(row, s.key) ?? 0)),
  );
  const max = domain?.[1] ?? (Math.max(0, ...values) || 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%` as const;
  const show = (s: Series<Row>, v: number) => (s.format ?? ((x) => fmt("value", x)))(v);

  return (
    <View className="gap-3">
      {legend && data[0] ? (
        <Swatches items={series.map((s) => ({ color: s.color(data[0]), label: s.label, opacity: s.opacity }))} />
      ) : null}
      {data.map((row) => (
        <View key={row.label} className="gap-1">
          <Text className="text-xs">{row.label}</Text>
          {stacked ? (
            <View className="h-5 flex-row overflow-hidden rounded bg-muted">
              {series.map((s) => {
                const v = valueOf(row, s.key) ?? 0;
                return v > 0 ? (
                  <View
                    key={s.key}
                    className="items-center justify-center"
                    style={{ width: pct(v), backgroundColor: s.color(row), opacity: s.opacity ?? 1 }}
                  >
                    {v / max > 0.08 ? <Text className="text-[10px] font-semibold text-white">{show(s, v)}</Text> : null}
                  </View>
                ) : null;
              })}
            </View>
          ) : (
            series.map((s) => {
              const v = valueOf(row, s.key);
              return (
                <View key={s.key} className="flex-row items-center gap-2">
                  <View className="h-3 flex-1 justify-center">
                    {v != null ? (
                      <View className="h-3 rounded" style={{ width: pct(v), backgroundColor: s.color(row), opacity: s.opacity ?? 1 }} />
                    ) : null}
                  </View>
                  <Text className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
                    {v == null ? "—" : show(s, v)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      ))}
    </View>
  );
}

// ── Cột Δ hai phía ──

/** Δ quanh 0, trục đối xứng; `tolerance` → dải xám ±tolerance = vùng đạt. Hàng có `color` hoặc `tone`. */
export function DeltaBars({
  data,
  tolerance,
}: {
  data: { label: string; delta?: number; color?: string; tone?: Tone }[];
  tolerance?: number;
}) {
  const c = useLabColors();
  const maxAbs = Math.max(tolerance ?? 0, ...data.map((d) => Math.abs(d.delta ?? 0)));
  const m = maxAbs > 0 ? maxAbs * 1.15 : 1;
  const half = (v: number) => `${(Math.min(Math.abs(v), m) / m) * 50}%` as const;
  return (
    <View className="gap-2.5">
      {data.map((row) => {
        const d = row.delta;
        return (
          <View key={row.label} className="gap-1">
            <Text className="text-xs">{row.label}</Text>
            <View className="flex-row items-center gap-2">
              <View className="h-4 flex-1 justify-center">
                {tolerance != null ? (
                  <View
                    className="absolute inset-y-0"
                    style={{ left: `${50 - (tolerance / m) * 50}%`, width: `${(tolerance / m) * 100}%`, backgroundColor: c.muted, opacity: 0.18 }}
                  />
                ) : null}
                <View className="absolute inset-y-0 left-1/2 w-px" style={{ backgroundColor: c.foreground, opacity: 0.5 }} />
                {d != null ? (
                  <View
                    // Chỉ bo đầu ngoài — đầu dính vạch 0 để vuông.
                    className={cn("absolute h-3", d >= 0 ? "rounded-r" : "rounded-l")}
                    style={{
                      width: half(d),
                      ...(d >= 0 ? { left: "50%" } : { right: "50%" }),
                      backgroundColor: row.color ?? c.tone(row.tone ?? "clip"),
                    }}
                  />
                ) : null}
              </View>
              <Text className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
                {d == null ? "—" : fmt("delta", d)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Đường ──

/** Đường (1 màu / series). `xType="number"` + `diagonal` → reliability diagram (y = x là hoàn hảo). */
export function Lines<Row extends Record<string, unknown>>({
  data,
  series,
  xKey = "label",
  xType = "category",
  yDomain = [0, 1],
  diagonal,
  height = 220,
}: {
  data: Row[];
  series: { key: string; label: string; color: string; dashed?: boolean }[];
  xKey?: string;
  xType?: "category" | "number";
  yDomain?: [number, number];
  diagonal?: boolean;
  height?: number;
}) {
  const c = useLabColors();
  const f = useTextFactor();
  const [width, setWidth] = useState(0);
  // Lề trục / nhãn giãn theo cỡ chữ (nhãn 10px × f).
  const pad = { l: Math.round(28 * f), r: 8, t: 8, b: Math.round(20 * f) };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const xs = data.map((row, i) =>
    xType === "number" ? Number(row[xKey]) : data.length > 1 ? i / (data.length - 1) : 0.5,
  );
  const X = (v: number) => pad.l + v * w;
  const Y = (v: number) => pad.t + (1 - (v - yDomain[0]) / (yDomain[1] - yDomain[0])) * h;
  const ticks = [yDomain[0], (yDomain[0] + yDomain[1]) / 2, yDomain[1]];
  // Màn hẹp / chữ to: nhãn trục X (40pt × f) không vừa khoảng cách điểm → chỉ hiện mỗi `labelStep` nhãn.
  const labelStep = data.length > 1 ? Math.max(1, Math.ceil((40 * f) / (w / (data.length - 1) || 1))) : 1;

  return (
    <View className="gap-2">
      <Swatches items={series.map((s) => ({ color: s.color, label: s.label }))} />
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              {ticks.map((tick) => (
                <Line key={tick} x1={pad.l} x2={pad.l + w} y1={Y(tick)} y2={Y(tick)} stroke={c.muted} strokeOpacity={0.25} strokeDasharray="3 3" />
              ))}
              {diagonal ? (
                <Line x1={X(0)} y1={Y(yDomain[0])} x2={X(1)} y2={Y(yDomain[1])} stroke={c.muted} strokeDasharray="4 4" />
              ) : null}
              {series.map((s) => {
                const pts = data
                  .map((row, i) => ({ x: xs[i], y: valueOf(row, s.key) }))
                  .filter((p): p is { x: number; y: number } => p.y != null && Number.isFinite(p.x));
                return (
                  <G key={s.key}>
                    <Polyline
                      points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray={s.dashed ? "5 4" : undefined}
                    />
                    {pts.map((p, i) => (
                      <Circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3} fill={s.color} />
                    ))}
                  </G>
                );
              })}
            </Svg>
            {ticks.map((tick) => (
              <Text key={tick} className="absolute text-[10px] text-muted-foreground" style={{ left: 0, top: Y(tick) - 7 * f }}>
                {fmt("value", tick)}
              </Text>
            ))}
            {xType === "category"
              ? data.map((row, i) => // nhãn cuối luôn hiện; nhãn quá sát nó thì bỏ
                i === data.length - 1 || (i % labelStep === 0 && data.length - 1 - i >= labelStep) ? (
                  <Text
                    key={i}
                    className="absolute text-[10px] text-muted-foreground"
                    style={{ top: height - 14 * f, left: X(xs[i]) - 20 * f, width: 40 * f, textAlign: "center" }}
                  >
                    {String(row[xKey])}
                  </Text>
                ) : null)
              : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

// ── Bảng Δ + CI ──

export function CiTable({
  rows,
}: {
  rows: { label: string; delta?: number; lo?: number; hi?: number; significant: boolean }[];
}) {
  const { t } = useTranslation();
  const f = (v?: number) => (v == null ? "—" : fmt("delta", v));
  return (
    <View className="overflow-hidden rounded-xl border border-border">
      {rows.map((r, i) => (
        <View key={r.label} className={cn("gap-1 px-3 py-2", i > 0 && "border-t border-border")}>
          <Text className="text-xs">{r.label}</Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold tabular-nums">Δ {f(r.delta)}</Text>
            <Text className="flex-1 text-[11px] tabular-nums text-muted-foreground">
              CI {f(r.lo)} … {f(r.hi)}
            </Text>
            <AdminBadge label={t(r.significant ? "lab.ci.significant" : "lab.ci.noDiff")} variant={r.significant ? "secondary" : "outline"} />
          </View>
        </View>
      ))}
    </View>
  );
}

