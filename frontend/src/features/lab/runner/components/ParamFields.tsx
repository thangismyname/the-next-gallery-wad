import { useTranslation } from "react-i18next";
import type { LabModelOption, LabParamSpec } from "@tng/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isListParam } from "@tng/shared/lab";

// Tham số hay đổi nhất hiện trước; còn lại gập trong "Tham số khác".
const COMMON = new Set(["smoke", "note", "latest"]);

/** Form tham số 1 lệnh, dựng từ schema. Giá trị giữ dạng chuỗi (cho phép "$TÊN"), parse khi thêm bước. */
export function ParamFields({
  specs,
  values,
  onChange,
  suggest,
  common = COMMON,
  idPrefix = "param",
}: {
  specs: LabParamSpec[];
  values: Record<string, string>;
  onChange: (name: string, text: string) => void;
  /** Gợi ý cho ô model (datalist — vẫn gõ được tên khác). */
  suggest?: (name: string) => LabModelOption[];
  /** Tham số hiện ngay; còn lại gập trong "Tham số khác". */
  common?: Set<string>;
  /** Tiền tố id ô nhập — khác nhau khi nhiều form cùng trang (suite: mỗi bước 1 form). */
  idPrefix?: string;
}) {
  const { t } = useTranslation();
  const shown = specs.filter((s) => common.has(s.name));
  const rest = specs.filter((s) => !common.has(s.name));
  const field = (spec: LabParamSpec) => (
    <Field
      key={spec.name}
      id={`${idPrefix}-${spec.name}`}
      spec={spec}
      value={values[spec.name] ?? ""}
      options={suggest?.(spec.name) ?? []}
      onChange={(v) => onChange(spec.name, v)}
    />
  );
  return (
    <div className="space-y-3">
      {shown.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{shown.map(field)}</div>}
      {rest.length > 0 && (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
            {t("lab.runner.moreParams", { count: rest.length })}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{rest.map(field)}</div>
        </details>
      )}
    </div>
  );
}

function Field({
  id,
  spec,
  value,
  options,
  onChange,
}: {
  id: string;
  spec: LabParamSpec;
  value: string;
  options: LabModelOption[];
  onChange: (v: string) => void;
}) {
  const label = (
    <Label htmlFor={id} className="font-mono text-xs" title={spec.help}>
      {spec.name}
      <span className="ml-1 font-sans font-normal text-muted-foreground">{spec.type}</span>
    </Label>
  );
  const help = spec.help && <p className="line-clamp-2 text-[11px] text-muted-foreground">{spec.help}</p>;

  if (spec.type === "bool") {
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            className="size-4 accent-primary"
            checked={value === "true"}
            onChange={(e) => onChange(String(e.target.checked))}
          />
          {label}
        </label>
        {help}
      </div>
    );
  }
  if (spec.choices && !isListParam(spec)) {
    return (
      <div className="space-y-1">
        {label}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.choices.map((c) => (
              <SelectItem key={c} value={c} className="font-mono">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {label}
      <ModelInput id={id} value={value} options={options} placeholder={spec.choices?.join(" ")} onChange={onChange} />
      {help}
    </div>
  );
}

/** Ô nhập có gợi ý model (datalist): chọn từ danh sách hoặc gõ tên bất kỳ. */
export function ModelInput({
  id,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: LabModelOption[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <Input
        id={id}
        list={options.length ? `${id}-models` : undefined}
        className="font-mono text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {options.length > 0 && (
        <datalist id={`${id}-models`}>
          {options.map((o) => (
            <option key={o.id} value={o.id} label={o.label} />
          ))}
        </datalist>
      )}
    </>
  );
}
