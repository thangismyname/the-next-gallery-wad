import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Play } from "lucide-react";
import { labQueryKeys, type LabJobStep, type LabParamValue, type LabRunnerSchema, type LabSuiteOptions } from "@tng/shared";
import {
  changedParams,
  compactSuiteModels,
  modelOptions,
  paramText,
  parseParam,
  stepSummary,
  suiteModelDefaults,
  suiteStepParams,
  toggleIn,
} from "@tng/shared/lab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { planLabSuite } from "@/services/lab";
import { ModelInput, ParamFields } from "./ParamFields";

const DEVICES = ["auto", "mps", "cpu", "cuda"];
const YOLO_MODES = ["eval", "train", "skip"] as const;

/** Chạy theo bước: chọn bước (thứ tự pipeline) · model chung · YOLO fine-tune (mỗi model = 1 chuỗi biến thể) ·
 *  smoke/device/ghi chú · tuỳ chỉnh từng bước → xem trước các bước (ai-service build_suite) → Chạy. */
export function SuiteBuilder({
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
  const defaults = schema.suite.defaults;
  const modelDefaults = useMemo(() => suiteModelDefaults(schema), [schema]);
  const [steps, setSteps] = useState<string[]>(defaults.steps);
  const [yoloFt, setYoloFt] = useState<NonNullable<LabSuiteOptions["yolo_ft"]>>(defaults.yolo_ft ?? "eval");
  const [models, setModels] = useState<LabSuiteOptions["models"]>({ ...modelDefaults, ...defaults.models });
  const [smoke, setSmoke] = useState("0");
  const [device, setDevice] = useState("auto");
  const [note, setNote] = useState("");
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});

  const options = useMemo<LabSuiteOptions>(() => {
    const parsed = Object.fromEntries(
      Object.entries(overrides).map(([cmd, values]) => {
        const specs = suiteStepParams(schema, cmd);
        const typed: Record<string, LabParamValue> = Object.fromEntries(
          specs.map((s) => [s.name, parseParam(s, values[s.name] ?? paramText(s.default))]),
        );
        return [cmd, changedParams(specs, typed)];
      }),
    );
    return {
      steps: schema.suite.steps.filter((s) => steps.includes(s)),
      yolo_ft: yoloFt,
      models: compactSuiteModels(models, modelDefaults),
      ...(Number(smoke) > 0 ? { smoke: Number(smoke) } : {}),
      ...(device !== "auto" ? { device } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      overrides: Object.fromEntries(Object.entries(parsed).filter(([, v]) => Object.keys(v).length)),
    };
  }, [schema, steps, yoloFt, models, modelDefaults, smoke, device, note, overrides]);
  const debounced = useDebounce(options, 400);
  const plan = useQuery({
    queryKey: labQueryKeys.plan(debounced),
    queryFn: () => planLabSuite(debounced),
    enabled: debounced.steps.length > 0,
    staleTime: Infinity,
  });
  const ready = plan.data && debounced === options;

  const setModel = <K extends keyof LabSuiteOptions["models"]>(key: K, value: LabSuiteOptions["models"][K]) =>
    setModels((prev) => ({ ...prev, [key]: value }));
  const ft = models.ft ?? [];
  const ftMain = models.ft_main ?? ft[0];

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{t("lab.runner.suite.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1 · Bước */}
        <Section index={1} title={t("lab.runner.suite.steps")}>
          <ol className="divide-y divide-border/60 rounded-lg border border-border/60">
            {schema.suite.steps.map((cmd) => {
              const on = steps.includes(cmd);
              const expanded = open.includes(cmd);
              const specs = suiteStepParams(schema, cmd);
              const changed = Object.keys(options.overrides?.[cmd] ?? {}).length;
              return (
                <li key={cmd} className={cn(!on && "opacity-60")}>
                  <div className="flex items-start gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={on}
                      aria-label={cmd}
                      onChange={() => setSteps((prev) => toggleIn(prev, cmd))}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm">{cmd}</span>
                      <p className="text-xs text-muted-foreground">
                        {t(`lab.exp.${cmd}.short`, { defaultValue: schema.commands[cmd]?.help ?? "" })}
                      </p>
                    </div>
                    {specs.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setOpen((prev) => toggleIn(prev, cmd))}
                      >
                        {t("lab.runner.suite.customize")}
                        {changed > 0 && <span className="text-xs text-muted-foreground">({changed})</span>}
                        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="border-t border-border/60 bg-muted/20 px-3 py-3">
                      <ParamFields
                        idPrefix={`suite-${cmd}`}
                        specs={specs}
                        common={new Set(specs.map((s) => s.name))}
                        values={{
                          ...Object.fromEntries(specs.map((s) => [s.name, paramText(s.default)])),
                          ...overrides[cmd],
                        }}
                        suggest={(name) => modelOptions(schema, name)}
                        onChange={(name, text) =>
                          setOverrides((prev) => ({ ...prev, [cmd]: { ...prev[cmd], [name]: text } }))
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>

        {/* 2 · Model */}
        <Section index={2} title={t("lab.runner.suite.models")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModelField id="suite-clip" label={t("lab.runner.suite.clip")}>
              <ModelInput
                id="suite-clip"
                value={models.clip ?? ""}
                options={schema.models.clip}
                onChange={(v) => setModel("clip", v)}
              />
            </ModelField>
            <ModelField id="suite-dino" label={t("lab.runner.suite.dino")}>
              <ModelInput
                id="suite-dino"
                value={models.dino ?? ""}
                options={schema.models.dino}
                onChange={(v) => setModel("dino", v)}
              />
            </ModelField>
            <ModelField id="suite-yolo" label={t("lab.runner.suite.yolo")}>
              <ModelInput
                id="suite-yolo"
                value={models.yolo ?? ""}
                options={schema.models.yolo}
                onChange={(v) => setModel("yolo", v)}
              />
            </ModelField>
            <div className="space-y-1">
              <Label className="text-xs">{t("lab.runner.suite.e1")}</Label>
              <div className="space-y-1 rounded-lg border border-border/60 p-2">
                {schema.models.clip.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={(models.e1 ?? []).includes(m.id)}
                      onChange={() => setModel("e1", toggleIn(models.e1 ?? [], m.id))}
                    />
                    <span className="font-mono">{m.id}</span>
                    {m.label && <span className="text-muted-foreground">· {m.label}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t("lab.runner.suite.ft")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {YOLO_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setYoloFt(mode)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs",
                    yoloFt === mode ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/50",
                  )}
                >
                  {t(`lab.runner.suite.ftMode.${mode}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t(`lab.runner.suite.ftHint.${yoloFt}`)}</p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {schema.models.yolo_ft.map((m) => {
                const included = ft.includes(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={included}
                      aria-label={m.id}
                      onChange={() => setModel("ft", toggleIn(ft, m.id))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{m.id}</div>
                      {m.label && <div className="truncate text-muted-foreground">{m.label}</div>}
                    </div>
                    <MainRadio
                      checked={included && ftMain === m.id}
                      disabled={!included}
                      onChange={() => setModel("ft_main", m.id)}
                    />
                  </li>
                );
              })}
              {yoloFt === "train" && (
                <li className="flex items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="size-3.5" />
                  <span className="flex-1">{t("lab.runner.suite.newModel")}</span>
                  <MainRadio checked={ftMain === "new"} onChange={() => setModel("ft_main", "new")} />
                </li>
              )}
            </ul>
          </div>
        </Section>

        {/* 3 · Chung */}
        <Section index={3} title={t("lab.runner.suite.common")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="suite-smoke" className="text-xs">
                smoke
              </Label>
              <Input
                id="suite-smoke"
                inputMode="numeric"
                className="font-mono text-xs"
                value={smoke}
                onChange={(e) => setSmoke(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">device</Label>
              <Select value={device} onValueChange={setDevice}>
                <SelectTrigger className="w-full font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICES.map((d) => (
                    <SelectItem key={d} value={d} className="font-mono">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="suite-note" className="text-xs">
                note
              </Label>
              <Input id="suite-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("lab.runner.suite.smokeHint")}</p>
        </Section>

        {/* 4 · Xem trước + Chạy */}
        <Section index={4} title={t("lab.runner.suite.preview", { count: plan.data?.steps.length ?? 0 })}>
          {options.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lab.runner.queueEmpty")}</p>
          ) : plan.isError ? (
            <p className="text-xs text-destructive">{plan.error.message}</p>
          ) : !plan.data ? (
            <Skeleton className="h-32 rounded-lg bg-muted/40" />
          ) : (
            <ol
              className={cn(
                "max-h-72 divide-y divide-border/60 overflow-auto rounded-lg border border-border/60",
                !ready && "opacity-60",
              )}
            >
              {plan.data.steps.map((step, i) => (
                <li key={i} className="flex gap-2 px-3 py-1.5">
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                  <code className="min-w-0 flex-1 text-xs break-all">{stepSummary(step)}</code>
                </li>
              ))}
            </ol>
          )}
          <Input value={label} placeholder={t("lab.runner.label")} onChange={(e) => setLabel(e.target.value)} />
          <Button
            className="w-full"
            disabled={Boolean(blockedReason) || starting || !ready || !plan.data?.steps.length}
            onClick={() => plan.data && onStart({ label: label.trim() || undefined, steps: plan.data.steps })}
          >
            <Play className="size-4" />
            {t("lab.runner.start", { count: plan.data?.steps.length ?? 0 })}
          </Button>
          {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted font-mono text-[11px]">
          {index}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ModelField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

function MainRadio({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  return (
    <label className={cn("flex shrink-0 items-center gap-1 text-[11px]", disabled && "opacity-40")}>
      <input
        type="radio"
        name="suite-ft-main"
        className="size-3.5 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {t("lab.runner.suite.main")}
    </label>
  );
}
