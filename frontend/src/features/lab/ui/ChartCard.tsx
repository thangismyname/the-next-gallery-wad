// Card bọc 1 biểu đồ: tiêu đề, chú thích, legend, nút mở experiment.
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ChartCard({
  title,
  caption,
  onOpen,
  legend,
  children,
}: {
  title: string;
  caption?: string;
  onOpen?: () => void;
  /** Chú thích màu của riêng biểu đồ này (KindLegend / ToleranceLegend / Swatches). */
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-mono text-xs font-normal tracking-widest text-muted-foreground uppercase">
            {title}
          </CardTitle>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {t("lab.overview.open")}
              <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
        {legend && <div className="pt-1">{legend}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
