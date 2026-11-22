import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus, Play, X } from "lucide-react";
import type { LabJobStep, LabParamValue, LabRunnerSchema } from "@tng/shared";
import { changedParams, missingVars, modelOptions, paramText, parseParam, stepSummary } from "@tng/shared/lab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParamFields } from "./ParamFields";

const defaults = (schema: LabRunnerSchema, cmd: string) =>
  Object.fromEntries((schema.commands[cmd]?.params ?? []).map((p) => [p.name, paramText(p.default)]));

/** Lệnh lẻ (nâng cao): chọn lệnh + tham số → thêm bước → hàng đợi → Chạy. Suite theo bước: `SuiteBuilder`. */
export function JobBuilder({
  schema,
  blockedReason,
  starting,
  error,
  onStart,
}: {
  schema: LabRunnerSchema;
  blockedReason?: string;
  starting: boolean;
  error?: string;
  onStart: (body: { label?: string; steps: LabJobStep[] }) => void;
}) {
  const { t } = useTranslation();
  const commands = Object.keys(schema.commands);
  const [cmd, setCmd] = useState(commands.find((c) => c === "e1") ?? commands[0]);
  const [values, setValues] = useState(() => defaults(schema, cmd));
  const [saveAs, setSaveAs] = useState("");
  const [steps, setSteps] = useState<LabJobStep[]>([]);
  const [label, setLabel] = useState("");
  const specs = schema.commands[cmd]?.params ?? [];
  const missing = missingVars(steps);

  const pickCommand = (next: string) => {
    setCmd(next);
    setValues(defaults(schema, next));
    setSaveAs("");
  };

  const addStep = () => {
    const parsed: Record<string, LabParamValue> = Object.fromEntries(
      specs.map((s) => [s.name, parseParam(s, values[s.name] ?? "")]),
    );
    const name = saveAs.trim().toUpperCase();
    setSteps((prev) => [...prev, { cmd, params: changedParams(specs, parsed), ...(name ? { save_as: name } : {}) }]);
    setSaveAs("");
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{t("lab.runner.build")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="space-y-1">
            <Label>{t("lab.runner.command")}</Label>
            <Select value={cmd} onValueChange={pickCommand}>
              <SelectTrigger className="w-full font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {commands.map((c) => (
                  <SelectItem key={c} value={c} className="font-mono">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{schema.commands[cmd]?.help}</p>
          </div>
          <ParamFields
            key={cmd}
            specs={specs}
            values={values}
            suggest={(name) => modelOptions(schema, name)}
            onChange={(name, text) => setValues((prev) => ({ ...prev, [name]: text }))}
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="save-as" className="text-xs">
                {t("lab.runner.saveAs")}
              </Label>
              <Input
                id="save-as"
                className="font-mono text-xs"
                placeholder="E4_A"
                value={saveAs}
                onChange={(e) => setSaveAs(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              />
            </div>
            <Button size="sm" onClick={addStep}>
              <ListPlus className="size-4" />
              {t("lab.runner.addStep")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("lab.runner.saveAsHint")}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("lab.runner.queue")}</Label>
            {steps.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSteps([])}>
                {t("lab.runner.clear")}
              </Button>
            )}
          </div>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lab.runner.queueEmpty")}</p>
          ) : (
            <ol className="divide-y divide-border/60 rounded-lg border border-border/60">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-1.5">
                  <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-[11px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <code className="min-w-0 flex-1 text-xs break-all">{stepSummary(step)}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    aria-label={t("lab.runner.remove")}
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          {missing.length > 0 && (
            <p className="text-xs text-destructive">{t("lab.runner.missingVars", { vars: missing.join(", ") })}</p>
          )}
        </div>

        <div className="space-y-2">
          <Input value={label} placeholder={t("lab.runner.label")} onChange={(e) => setLabel(e.target.value)} />
          <Button
            className="w-full"
            disabled={Boolean(blockedReason) || starting || steps.length === 0 || missing.length > 0}
            onClick={() => onStart({ label: label.trim() || undefined, steps })}
          >
            <Play className="size-4" />
            {t("lab.runner.start", { count: steps.length })}
          </Button>
          {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
