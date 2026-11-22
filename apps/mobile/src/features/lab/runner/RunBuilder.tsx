import type { LabJobStep, LabModelOption, LabParamSpec, LabParamValue, LabRunnerSchema } from "@tng/shared";
import {
  changedParams,
  isListParam,
  missingVars,
  modelOptions,
  paramText,
  parseParam,
  stepSummary,
} from "@tng/shared/lab";
import { ListPlus, Play, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { AdminCard } from "@/features/admin/components/AdminUi";
import { Segmented } from "@/features/profile/components/SettingsGroup";
import { cn } from "@/lib/utils";

// Tham số hay đổi nhất hiện trước; còn lại mở bằng "Tham số khác" (web: <details>).
const COMMON = new Set(["smoke", "note", "latest"]);
const NO_AUTO = { autoCapitalize: "none", autoCorrect: false, spellCheck: false } as const;

const defaults = (schema: LabRunnerSchema, cmd: string) =>
  Object.fromEntries((schema.commands[cmd]?.params ?? []).map((p) => [p.name, paramText(p.default)]));

/** Lệnh lẻ (web `JobBuilder`): lệnh + tham số → bước → hàng đợi → Chạy. Theo bước: `RunSuite`. */
export function RunBuilder({
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
  const [more, setMore] = useState(false);
  const [saveAs, setSaveAs] = useState("");
  const [steps, setSteps] = useState<LabJobStep[]>([]);
  const [label, setLabel] = useState("");
  const specs = schema.commands[cmd]?.params ?? [];
  const missing = missingVars(steps);
  const shown = specs.filter((s) => more || COMMON.has(s.name));

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
    <AdminCard title={t("lab.runner.build")}>
      <View className="gap-4">
        <View className="gap-3 rounded-xl border border-border p-3">
          <Text className="text-xs font-semibold text-muted-foreground">{t("lab.runner.command")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {commands.map((c) => (
              <Chip key={c} label={c} active={c === cmd} onPress={() => pickCommand(c)} />
            ))}
          </ScrollView>
          <Text className="text-xs text-muted-foreground">{schema.commands[cmd]?.help}</Text>

          {shown.map((spec) => (
            <Field
              key={`${cmd}.${spec.name}`}
              spec={spec}
              value={values[spec.name] ?? ""}
              options={modelOptions(schema, spec.name)}
              onChange={(text) => setValues((prev) => ({ ...prev, [spec.name]: text }))}
            />
          ))}
          {specs.length > shown.length || more ? (
            <Pressable onPress={() => setMore((v) => !v)} hitSlop={8}>
              <Text className="text-xs text-muted-foreground">
                {t("lab.runner.moreParams", { count: specs.filter((s) => !COMMON.has(s.name)).length })} {more ? "▴" : "▾"}
              </Text>
            </Pressable>
          ) : null}

          <View className="gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">{t("lab.runner.saveAs")}</Text>
            <Input
              {...NO_AUTO}
              value={saveAs}
              placeholder="E4_A"
              onChangeText={(v) => setSaveAs(v.replace(/[^A-Za-z0-9_]/g, ""))}
              className="font-mono text-xs"
            />
            <Text className="text-[11px] text-muted-foreground">{t("lab.runner.saveAsHint")}</Text>
          </View>
          <Button variant="outline" onPress={addStep} className="flex-row gap-2">
            <Icon as={ListPlus} size={16} className="text-foreground" />
            <Text>{t("lab.runner.addStep")}</Text>
          </Button>
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-muted-foreground">{t("lab.runner.queue")}</Text>
            {steps.length > 0 ? (
              <Pressable onPress={() => setSteps([])} hitSlop={8}>
                <Text className="text-xs text-muted-foreground">{t("lab.runner.clear")}</Text>
              </Pressable>
            ) : null}
          </View>
          {steps.length === 0 ? (
            <Text className="text-sm text-muted-foreground">{t("lab.runner.queueEmpty")}</Text>
          ) : (
            <View className="overflow-hidden rounded-xl border border-border">
              {steps.map((step, i) => (
                <View key={i} className={cn("flex-row items-start gap-2 px-3 py-2", i > 0 && "border-t border-border")}>
                  <Text className="w-5 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</Text>
                  <Text className="flex-1 font-mono text-[11px]">{stepSummary(step)}</Text>
                  <Pressable
                    accessibilityLabel={t("lab.runner.remove")}
                    hitSlop={8}
                    onPress={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Icon as={X} size={14} className="text-muted-foreground" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {missing.length > 0 ? (
            <Text className="text-xs text-destructive">{t("lab.runner.missingVars", { vars: missing.join(", ") })}</Text>
          ) : null}
        </View>

        <Input value={label} placeholder={t("lab.runner.label")} onChangeText={setLabel} />
        <Button
          disabled={Boolean(blockedReason) || starting || steps.length === 0 || missing.length > 0}
          onPress={() => onStart({ label: label.trim() || undefined, steps })}
          className="flex-row gap-2"
        >
          <Icon as={Play} size={16} className="text-primary-foreground" />
          <Text>{t("lab.runner.start", { count: steps.length })}</Text>
        </Button>
        {blockedReason ? <Text className="text-xs text-muted-foreground">{blockedReason}</Text> : null}
        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      </View>
    </AdminCard>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn("rounded-full border px-3 py-1.5", active ? "border-primary bg-primary/10" : "border-border")}
    >
      <Text className={cn("font-mono text-xs", !active && "text-muted-foreground")}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  spec,
  value,
  options = [],
  onChange,
}: {
  spec: LabParamSpec;
  value: string;
  options?: LabModelOption[];
  onChange: (v: string) => void;
}) {
  const choices = spec.type === "bool" ? ["true", "false"] : !isListParam(spec) ? spec.choices : null;
  return (
    <View className="gap-1">
      <Text className="font-mono text-xs">
        {spec.name} <Text className="text-[11px] text-muted-foreground">{spec.type}</Text>
      </Text>
      {choices && choices.length <= 4 ? (
        <Segmented value={value} onChange={onChange} options={choices.map((c) => ({ value: c, label: c }))} />
      ) : choices ? (
        <View className="flex-row flex-wrap gap-2">
          {choices.map((c) => (
            <Chip key={c} label={c} active={c === value} onPress={() => onChange(c)} />
          ))}
        </View>
      ) : (
        <ModelInput value={value} options={options} placeholder={spec.choices?.join(" ")} onChange={onChange} />
      )}
      {spec.help ? (
        <Text numberOfLines={2} className="text-[11px] text-muted-foreground">
          {spec.help}
        </Text>
      ) : null}
    </View>
  );
}

/** Ô nhập + chip gợi ý model (web: datalist) — chạm chip = điền, vẫn gõ được tên khác. */
export function ModelInput({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: LabModelOption[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="gap-2">
      <Input {...NO_AUTO} value={value} placeholder={placeholder} onChangeText={onChange} className="font-mono text-xs" />
      {options.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {options.map((o) => (
            <Chip key={o.id} label={o.label ? `${o.id} · ${o.label}` : o.id} active={o.id === value} onPress={() => onChange(o.id)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
