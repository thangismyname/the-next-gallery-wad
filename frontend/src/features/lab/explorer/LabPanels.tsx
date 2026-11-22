import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes, type LabRun } from "@tng/shared";
import { LabMetricChart } from "./LabMetricChart";
import { extractResult, formatValue, recordsTable, type StatGroup } from "./labTables";
import { useLabFile, useLabHistory } from "@/features/lab/useLab";

const titleClass = "font-mono text-xs font-normal tracking-widest text-muted-foreground uppercase";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className={titleClass}>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stats({ group }: { group: StatGroup }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-3 lg:grid-cols-4">
      {group.stats.map((s) => (
        <div key={s.key} className="bg-card px-3 py-2">
          <div className="truncate font-mono text-[10px] tracking-wider text-muted-foreground uppercase" title={s.key}>
            {s.key}
          </div>
          <div className="font-heading text-lg tabular-nums">{formatValue(s.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** result.json → thẻ chỉ số + 1 biểu đồ / bảng số. */
export function LabResultPanel({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const { tables, stats } = useMemo(() => extractResult(run.result), [run.result]);
  if (!tables.length && !stats.length) {
    return <p className="text-sm text-muted-foreground">{t("lab.noResult")}</p>;
  }
  return (
    <div className="space-y-4">
      {stats.map((g) => (
        <Section key={`s:${g.title}`} title={g.title || t("lab.summary")}>
          <Stats group={g} />
        </Section>
      ))}
      {tables.map((table) => (
        <Section key={`t:${table.title}`} title={table.title}>
          <LabMetricChart table={table} />
        </Section>
      ))}
    </div>
  );
}

/** CSV của run (per-class, strategies…) → chọn file → biểu đồ. */
export function LabCsvPanel({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  const [name, setName] = useState(run.files[0]?.name);
  const file = useLabFile(run.exp, run.run_id, name);
  const table = useMemo(
    () => (file.data && name ? recordsTable(name, file.data.rows) : null),
    [file.data, name],
  );
  if (!run.files.length) return <p className="text-sm text-muted-foreground">{t("lab.noFiles")}</p>;

  return (
    <Section title={t("lab.tabs.files")}>
      <div className="space-y-4">
        <Select value={name} onValueChange={setName}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {run.files.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.name} <span className="text-muted-foreground">· {formatBytes(f.size)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {file.isLoading ? (
          <Skeleton className="h-64 rounded-lg bg-muted/40" />
        ) : file.isError ? (
          <p className="text-sm text-destructive">{t("admin.error.loadFailed")}</p>
        ) : table ? (
          <>
            {file.data?.truncated && (
              <p className="text-xs text-muted-foreground">{t("lab.truncated", { count: file.data.rows.length })}</p>
            )}
            {/* key: đổi file → reset metric đã chọn */}
            <LabMetricChart key={name} table={table} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("lab.noNumbers")}</p>
        )}
      </div>
    </Section>
  );
}

/** History/<exp>/index.csv → đường metric qua các version (vNNN). */
export function LabHistoryPanel({ exp }: { exp: string }) {
  const { t } = useTranslation();
  const history = useLabHistory(exp);
  const table = useMemo(
    () => (history.data ? recordsTable("history", history.data.rows, ["version"]) : null),
    [history.data],
  );
  if (history.isLoading) return <Skeleton className="h-72 rounded-xl bg-muted/40" />;
  if (!table) return <p className="text-sm text-muted-foreground">{t("lab.noHistory")}</p>;
  return (
    <Section title={t("lab.tabs.history")}>
      <LabMetricChart
        key={exp}
        table={table}
        kind="line"
        initialMetrics={table.metrics.filter((m) => m.startsWith("test")).slice(0, 3)}
      />
    </Section>
  );
}

/** events.jsonl (300 dòng cuối) + config.json. */
export function LabLogPanel({ run }: { run: LabRun }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t("lab.events")}>
        <pre className="max-h-[28rem] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {run.events
            .map((e) => `${e.t?.slice(11, 19) ?? ""}  ${e.type === "stage" ? `▶ ${e.stage}` : (e.message ?? JSON.stringify(e))}`)
            .join("\n") || "—"}
        </pre>
      </Section>
      <Section title={t("lab.config")}>
        <pre className="max-h-[28rem] overflow-auto font-mono text-[11px] leading-relaxed">
          {run.config ? JSON.stringify(run.config, null, 2) : "—"}
        </pre>
      </Section>
    </div>
  );
}
