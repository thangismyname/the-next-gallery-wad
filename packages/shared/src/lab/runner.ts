// Runner (chạy experiments từ UI): form tham số ↔ JSON params của `python -m experiments <cmd> --params-json`.
// Thuần, dùng chung web + mobile. Tên kiểu lấy từ experiments `schema` (core.params_schema).
import type {
  LabJobState,
  LabJobStep,
  LabModelOption,
  LabParamSpec,
  LabParamValue,
  LabRunnerSchema,
  LabSuiteOptions,
} from "../types";

export const isListParam = (spec: LabParamSpec) => spec.type.startsWith("list");
const isNumberType = (type: string) => /int|float/.test(type);

/** Giá trị → chuỗi trong ô nhập (list = cách nhau bằng dấu cách). */
export function paramText(value: LabParamValue | undefined): string {
  if (value == null) return "";
  return Array.isArray(value) ? value.join(" ") : String(value);
}

/** Chuỗi trong ô nhập → giá trị đúng kiểu. "$TÊN" (run id của bước trước) giữ nguyên là chuỗi. */
export function parseParam(spec: LabParamSpec, text: string): LabParamValue {
  const one = (s: string): string | number => {
    if (!isNumberType(spec.type) || s.startsWith("$")) return s;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  };
  if (isListParam(spec)) return text.split(/[\s,]+/).filter(Boolean).map(one);
  if (spec.type === "bool") return text === "true";
  return one(text.trim());
}

const same = (a: LabParamValue | undefined, b: LabParamValue | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Chỉ giữ tham số khác mặc định → job gọn, mặc định mới của CLI vẫn áp dụng. */
export function changedParams(
  specs: LabParamSpec[],
  values: Record<string, LabParamValue>,
): Record<string, LabParamValue> {
  return Object.fromEntries(
    specs.filter((s) => s.name in values && !same(values[s.name], s.default)).map((s) => [s.name, values[s.name]]),
  );
}

/** 1 dòng mô tả bước: "e4 weights=a.pt latest=false → $E4". */
export function stepSummary(step: LabJobStep): string {
  const params = Object.entries(step.params ?? {}).map(([k, v]) => `${k}=${paramText(v)}`);
  return [step.cmd, ...params, ...(step.save_as ? [`→ $${step.save_as}`] : [])].join(" ");
}

/** Biến "$TÊN" mà bước dùng nhưng các bước trước chưa lưu (save_as) — server cũng chặn. */
export function missingVars(steps: LabJobStep[]): string[] {
  const defined = new Set<string>();
  const missing: string[] = [];
  for (const step of steps) {
    for (const value of Object.values(step.params ?? {})) {
      for (const v of Array.isArray(value) ? value : [value]) {
        if (typeof v === "string" && v.startsWith("$") && !defined.has(v.slice(1))) missing.push(v);
      }
    }
    if (step.save_as) defined.add(step.save_as);
  }
  return missing;
}

export const isJobActive = (state?: LabJobState) => state === "queued" || state === "running";

/** Gợi ý model cho 1 tham số (clip / yolo gốc + fine-tune / dino) — rỗng nếu không phải tham số model. */
export function modelOptions(schema: LabRunnerSchema, param: string): LabModelOption[] {
  const kind = schema.model_params[param];
  if (kind === "yolo") return [...schema.models.yolo, ...schema.models.yolo_ft];
  return kind ? schema.models[kind] : [];
}

export const toggleIn = <T>(list: T[], item: T): T[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

const SUITE_COMMON = new Set(["smoke", "device", "note"]);

/** Tham số hiện ở ô "Tuỳ chỉnh" của 1 bước suite: bỏ smoke/device/note (chung) và model (chọn chung ở trên). */
export function suiteStepParams(schema: LabRunnerSchema, cmd: string): LabParamSpec[] {
  const models = schema.suite.model_keys[cmd] ?? {};
  return (schema.commands[cmd]?.params ?? []).filter((p) => !SUITE_COMMON.has(p.name) && !(p.name in models));
}

/** Model mặc định của CLI (để form hiện sẵn, và chỉ gửi khi khác mặc định). */
export function suiteModelDefaults(schema: LabRunnerSchema): LabSuiteOptions["models"] {
  const def = (cmd: string, name: string) => schema.commands[cmd]?.params.find((p) => p.name === name)?.default;
  return {
    clip: def("e2", "clip") as string | undefined,
    e1: def("e1", "models") as string[] | undefined,
    dino: def("probe", "dino") as string | undefined,
    yolo: def("e4", "weights") as string | undefined,
  };
}

/** Bỏ model trùng mặc định CLI → các bước gọn (chỉ hiện cái bạn đổi). */
export function compactSuiteModels(
  models: LabSuiteOptions["models"],
  defaults: LabSuiteOptions["models"],
): LabSuiteOptions["models"] {
  const out: LabSuiteOptions["models"] = { ...models };
  for (const key of ["clip", "e1", "dino", "yolo"] as const) {
    if (!out[key] || !(out[key] as string | string[]).length || same(out[key], defaults[key])) delete out[key];
  }
  return out;
}
