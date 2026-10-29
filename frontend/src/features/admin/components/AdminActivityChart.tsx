import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { AdminOverview } from "@/types";

/** Người dùng mới + lượt upload theo ngày (30 ngày). */
export function AdminActivityChart({
  data,
}: {
  data: AdminOverview["activity"];
}) {
  const { t, i18n } = useTranslation();
  const config = {
    uploads: { label: t("admin.chart.uploads"), color: "var(--primary)" },
    signups: {
      label: t("admin.chart.signups"),
      color: "var(--muted-foreground)",
    },
  } satisfies ChartConfig;
  const short = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "numeric",
    });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="font-mono text-xs font-normal tracking-widest text-muted-foreground uppercase">
          {t("admin.chart.activity")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <AreaChart data={data} margin={{ left: -16, right: 12 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={short}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={40}
            />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(v) => short(String(v))} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="uploads"
              type="monotone"
              fill="var(--color-uploads)"
              fillOpacity={0.15}
              stroke="var(--color-uploads)"
              strokeWidth={2}
            />
            <Area
              dataKey="signups"
              type="monotone"
              fill="var(--color-signups)"
              fillOpacity={0.1}
              stroke="var(--color-signups)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
