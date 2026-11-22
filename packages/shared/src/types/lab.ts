// Lab (khu Developer): kết quả experiments — ai-service app/api/lab.py, chỉ đọc.
export type LabCell = string | number | null;

export interface LabRunStatus {
  run_id: string;
  smoke: boolean;
  state?: string;
  stage?: string;
  elapsed_s?: number;
  updated?: string;
}

export interface LabExperiment {
  exp: string;
  latest: string | null;
  has_history: boolean;
  runs: LabRunStatus[];
}

export interface LabRun {
  exp: string;
  run_id: string;
  status: LabRunStatus | null;
  config: Record<string, unknown> | null;
  result: unknown;
  files: { name: string; size: number }[];
  events: { t?: string; type?: string; message?: string; stage?: string }[];
}

export interface LabTable {
  columns: string[];
  rows: Record<string, LabCell>[];
  truncated: boolean;
}

// Runner: chạy experiments từ UI — ai-service app/api/lab_runner.py + experiments/jobs.py.
export type LabParamValue = string | number | boolean | null | (string | number | boolean | null)[];

export interface LabParamSpec {
  name: string;
  type: string; // "str" | "int" | "float" | "bool" | "list[str]" | "list[float]"…
  default: LabParamValue;
  help: string;
  choices: string[] | null;
}

export interface LabJobStep {
  cmd: string;
  params: Record<string, LabParamValue>;
  /** Lưu run id bước này tạo vào biến → bước sau dùng "$TÊN". */
  save_as?: string;
  state?: "running" | "done" | "failed" | "cancelled";
  run_id?: string;
  started?: string;
  finished?: string;
  returncode?: number;
}

export type LabJobState = "queued" | "running" | "done" | "failed" | "cancelled" | "lost";

export interface LabJob {
  id: string;
  label: string;
  state: LabJobState;
  created: string;
  started?: string;
  finished?: string;
  current?: number;
  steps: LabJobStep[];
  log?: string;
}

export interface LabModelOption {
  id: string;
  label?: string;
  run_id?: string;
}

export type LabModelKind = "clip" | "yolo" | "dino";

/** Tuỳ chọn suite → `experiments.jobs build_suite` (mỗi YOLO fine-tune = 1 chuỗi biến thể E4 → E5 → probe → E6). */
export interface LabSuiteOptions {
  steps: string[];
  smoke?: number;
  device?: string;
  note?: string;
  yolo_ft?: "eval" | "train" | "skip";
  models: { clip?: string; e1?: string[]; dino?: string; yolo?: string; ft?: string[]; ft_main?: string };
  overrides?: Record<string, Record<string, LabParamValue>>;
}

export interface LabRunnerSchema {
  commands: Record<string, { help: string; params: LabParamSpec[] }>;
  presets: Record<string, { label: string; steps: LabJobStep[] }>;
  /** Model có trên máy ai-service (+ gợi ý CLIP). */
  models: { clip: LabModelOption[]; yolo: LabModelOption[]; yolo_ft: LabModelOption[]; dino: LabModelOption[] };
  /** Tên tham số → loại model (ô nhập hiện gợi ý). */
  model_params: Record<string, LabModelKind>;
  suite: {
    steps: string[];
    defaults: LabSuiteOptions;
    /** Bước → { tham số: khoá trong `LabSuiteOptions.models` } — chọn 1 lần cho cả suite. */
    model_keys: Record<string, Record<string, keyof LabSuiteOptions["models"]>>;
  };
}

export interface LabRunnerState {
  available: boolean;
  reason: string | null;
  external_running: boolean;
  active: LabJob | null;
  jobs: (Pick<LabJob, "id" | "label" | "state" | "created" | "finished"> & { steps: number })[];
}
