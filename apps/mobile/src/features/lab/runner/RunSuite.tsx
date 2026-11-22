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
import { useQuery } from "@tanstack/react-query";
import { Check, Play } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { AdminCard } from "@/features/admin/components/AdminUi";
import { Segmented } from "@/features/profile/components/SettingsGroup";
import { cn } from "@/lib/utils";
import { labApi } from "@/services";

import { Chip, Field, ModelInput } from "./RunBuilder";

const DEVICES = ["auto", "mps", "cpu", "cuda"];
const YOLO_MODES = ["eval", "train", "skip"] as const;

/** Chạy theo bước (web `SuiteBuilder`): bước · model · YOLO fine-tune · chung · tuỳ chỉnh từng bước → xem trước → Chạy. */
export function RunSuite({
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
  const [open, setOpen] = useState<string>();
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});

  const options = useMemo<LabSuiteOptions>(() => {
    const parsed = Object.entries(overrides).map(([cmd, values]) => {
      const specs = suiteStepParams(schema, cmd);
      const typed: Record<string, LabParamValue> = Object.fromEntries(
        specs.map((s) => [s.name, parseParam(s, values[s.name] ?? paramText(s.default))]),
      );
      return [cmd, changedParams(specs, typed)] as const;
    });
    return {
      steps: schema.suite.steps.filter((s) => steps.includes(s)),
      yolo_ft: yoloFt,
      models: compactSuiteModels(models, modelDefaults),
      ...(Number(smoke) > 0 ? { smoke: Number(smoke) } : {}),
      ...(device !== "auto" ? { device } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      overrides: Object.fromEntries(parsed.filter(([, v]) => Object.keys(v).length)),
    };
  }, [schema, steps, yoloFt, models, modelDefaults, smoke, device, note, overrides]);

  // Xem trước sau khi ngừng gõ (web `useDebounce(…, 400)`).
  const [debounced, setDebounced] = useState(options);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(options), 400);
    return () => clearTimeout(id);
  }, [options]);
  const plan = useQuery({
    queryKey: labQueryKeys.plan(debounced),
    queryFn: () => labApi.planLabSuite(debounced),
    enabled: debounced.steps.length > 0,
    staleTime: Infinity,
  });
  const ready = plan.data && debounced === options;

  const setModel = <K extends keyof LabSuiteOptions["models"]>(key: K, value: LabSuiteOptions["models"][K]) =>
    setModels((prev) => ({ ...prev, [key]: value }));
  const ft = models.ft ?? [];
  const ftMain = models.ft_main ?? ft[0];

  return (
    <AdminCard title={t("lab.runner.suite.title")}>
      <View className="gap-6">
        <Section index={1} title={t("lab.runner.suite.steps")}>
          <View className="overflow-hidden rounded-xl border border-border">
            {schema.suite.steps.map((cmd, i) => {
              const on = steps.includes(cmd);
              const specs = suiteStepParams(schema, cmd);
              const changed = Object.keys(options.overrides?.[cmd] ?? {}).length;
              return (
                <View key={cmd} className={cn(i > 0 && "border-t border-border")}>
                  <View className="flex-row items-start gap-3 px-3 py-2.5">
                    <CheckBox checked={on} label={cmd} onPress={() => setSteps((prev) => toggleIn(prev, cmd))} />
                    <View className={cn("flex-1 gap-0.5", !on && "opacity-60")}>
                      <Text className="font-mono text-sm">{cmd}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {t(`lab.exp.${cmd}.short`, { defaultValue: schema.commands[cmd]?.help ?? "" })}
                      </Text>
                    </View>
                    {specs.length > 0 ? (
                      <Pressable hitSlop={8} onPress={() => setOpen((v) => (v === cmd ? undefined : cmd))}>
                        <Text className="text-xs text-muted-foreground">
                          {t("lab.runner.suite.customize")}
                          {changed > 0 ? ` (${changed})` : ""} {open === cmd ? "▴" : "▾"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {open === cmd ? (
                    <View className="gap-3 border-t border-border bg-muted/30 p-3">
                      {specs.map((spec) => (
                        <Field
                          key={spec.name}
                          spec={spec}
                          value={overrides[cmd]?.[spec.name] ?? paramText(spec.default)}
                          options={modelOptions(schema, spec.name)}
                          onChange={(text) =>
                            setOverrides((prev) => ({ ...prev, [cmd]: { ...prev[cmd], [spec.name]: text } }))
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Section>

        <Section index={2} title={t("lab.runner.suite.models")}>
          <Labeled label={t("lab.runner.suite.clip")}>
            <ModelInput value={models.clip ?? ""} options={schema.models.clip} onChange={(v) => setModel("clip", v)} />
          </Labeled>
          <Labeled label={t("lab.runner.suite.dino")}>
            <ModelInput value={models.dino ?? ""} options={schema.models.dino} onChange={(v) => setModel("dino", v)} />
          </Labeled>
          <Labeled label={t("lab.runner.suite.yolo")}>
            <ModelInput value={models.yolo ?? ""} options={schema.models.yolo} onChange={(v) => setModel("yolo", v)} />
          </Labeled>
          <Labeled label={t("lab.runner.suite.e1")}>
            <View className="flex-row flex-wrap gap-2">
              {schema.models.clip.map((m) => (
                <Chip
                  key={m.id}
                  label={m.id}
                  active={(models.e1 ?? []).includes(m.id)}
                  onPress={() => setModel("e1", toggleIn(models.e1 ?? [], m.id))}
                />
              ))}
            </View>
          </Labeled>
          <Labeled label={t("lab.runner.suite.ft")}>
            <Segmented
              value={yoloFt}
              onChange={setYoloFt}
              options={YOLO_MODES.map((m) => ({ value: m, label: t(`lab.runner.suite.ftMode.${m}`) }))}
            />
            <Text className="text-[11px] text-muted-foreground">{t(`lab.runner.suite.ftHint.${yoloFt}`)}</Text>
            <View className="overflow-hidden rounded-xl border border-border">
              {schema.models.yolo_ft.map((m, i) => {
                const included = ft.includes(m.id);
                return (
                  <View key={m.id} className={cn("flex-row items-center gap-3 px-3 py-2", i > 0 && "border-t border-border")}>
                    <CheckBox checked={included} label={m.id} onPress={() => setModel("ft", toggleIn(ft, m.id))} />
                    <View className="flex-1">
                      <Text numberOfLines={1} className="font-mono text-[11px]">
                        {m.id}
                      </Text>
                      {m.label ? (
                        <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
                          {m.label}
                        </Text>
                      ) : null}
                    </View>
                    <MainToggle active={included && ftMain === m.id} disabled={!included} onPress={() => setModel("ft_main", m.id)} />
                  </View>
                );
              })}
              {yoloFt === "train" ? (
                <View className="flex-row items-center gap-3 border-t border-border px-3 py-2">
                  <Text className="flex-1 text-xs">{t("lab.runner.suite.newModel")}</Text>
                  <MainToggle active={ftMain === "new"} onPress={() => setModel("ft_main", "new")} />
                </View>
              ) : null}
            </View>
          </Labeled>
        </Section>

        <Section index={3} title={t("lab.runner.suite.common")}>
          <Labeled label="smoke">
            <Input
              keyboardType="number-pad"
              value={smoke}
              onChangeText={(v) => setSmoke(v.replace(/\D/g, ""))}
              className="font-mono text-xs"
            />
            <Text className="text-[11px] text-muted-foreground">{t("lab.runner.suite.smokeHint")}</Text>
          </Labeled>
          <Labeled label="device">
            <Segmented value={device} onChange={setDevice} options={DEVICES.map((d) => ({ value: d, label: d }))} />
          </Labeled>
          <Labeled label="note">
            <Input value={note} onChangeText={setNote} />
          </Labeled>
        </Section>

        <Section index={4} title={t("lab.runner.suite.preview", { count: plan.data?.steps.length ?? 0 })}>
          {options.steps.length === 0 ? (
            <Text className="text-sm text-muted-foreground">{t("lab.runner.queueEmpty")}</Text>
          ) : plan.isError ? (
            <Text className="text-xs text-destructive">{plan.error.message}</Text>
          ) : !plan.data ? (
            <Skeleton className="h-32 rounded-xl" />
          ) : (
            <View className={cn("overflow-hidden rounded-xl border border-border", !ready && "opacity-60")}>
              {plan.data.steps.map((step, i) => (
                <View key={i} className={cn("flex-row gap-2 px-3 py-2", i > 0 && "border-t border-border")}>
                  <Text className="w-5 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</Text>
                  <Text className="flex-1 font-mono text-[11px]">{stepSummary(step)}</Text>
                </View>
              ))}
            </View>
          )}
          <Input value={label} placeholder={t("lab.runner.label")} onChangeText={setLabel} />
          <Button
            disabled={Boolean(blockedReason) || starting || !ready || !plan.data?.steps.length}
            onPress={() => plan.data && onStart({ label: label.trim() || undefined, steps: plan.data.steps })}
            className="flex-row gap-2"
          >
            <Icon as={Play} size={16} className="text-primary-foreground" />
            <Text>{t("lab.runner.start", { count: plan.data?.steps.length ?? 0 })}</Text>
          </Button>
          {blockedReason ? <Text className="text-xs text-muted-foreground">{blockedReason}</Text> : null}
          {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
        </Section>
      </View>
    </AdminCard>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <View className="size-5 items-center justify-center rounded-full bg-muted">
          <Text className="font-mono text-[11px]">{index}</Text>
        </View>
        <Text className="text-sm font-semibold">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

function CheckBox({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className={cn(
        "mt-0.5 size-5 items-center justify-center rounded-md border",
        checked ? "border-primary bg-primary" : "border-border",
      )}
    >
      {checked ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
    </Pressable>
  );
}

function MainToggle({ active, disabled, onPress }: { active: boolean; disabled?: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn("rounded-full border px-2.5 py-1", active ? "border-primary bg-primary/10" : "border-border", disabled && "opacity-40")}
    >
      <Text className={cn("text-[11px]", !active && "text-muted-foreground")}>{t("lab.runner.suite.main")}</Text>
    </Pressable>
  );
}
