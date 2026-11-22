import type { HttpClient } from "../http";
import type {
  LabExperiment,
  LabJob,
  LabJobStep,
  LabRun,
  LabRunnerSchema,
  LabRunnerState,
  LabSuiteOptions,
  LabTable,
} from "../types";

export type { LabExperiment, LabRun, LabTable };

export const labQueryKeys = {
  experiments: ["lab"] as const,
  run: (exp: string, runId: string) => ["lab", exp, runId] as const,
  file: (exp: string, runId: string, name: string) => ["lab", exp, runId, name] as const,
  history: (exp: string) => ["lab", "history", exp] as const,
  runner: ["lab-runner"] as const,
  runnerSchema: ["lab-runner", "schema"] as const,
  plan: (options: LabSuiteOptions) => ["lab-runner", "plan", options] as const,
  job: (id: string) => ["lab-runner", "job", id] as const,
};

/** /api/lab — khu Developer (admin xem được). */
export const createLabService = (http: HttpClient) => ({
  fetchLabExperiments: (): Promise<{ available: boolean; experiments: LabExperiment[] }> =>
    http.get("/lab/experiments"),

  fetchLabRun: (exp: string, runId: string): Promise<LabRun> =>
    http.get(`/lab/experiments/${encodeURIComponent(exp)}/runs/${encodeURIComponent(runId)}`),

  fetchLabFile: (exp: string, runId: string, name: string): Promise<LabTable> =>
    http.get(
      `/lab/experiments/${encodeURIComponent(exp)}/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(name)}`,
    ),

  fetchLabHistory: (exp: string): Promise<LabTable> => http.get(`/lab/history/${encodeURIComponent(exp)}`),

  // Runner (chạy experiments từ UI): đọc = Developer + admin; chạy / dừng / xoá = Developer đã duyệt.
  fetchLabRunner: (): Promise<LabRunnerState> => http.get("/lab/runner"),
  fetchLabRunnerSchema: (): Promise<LabRunnerSchema> => http.get("/lab/runner/schema"),
  fetchLabJob: (id: string): Promise<LabJob> => http.get(`/lab/runner/jobs/${encodeURIComponent(id)}`),
  planLabSuite: (options: LabSuiteOptions): Promise<{ steps: LabJobStep[] }> =>
    http.post("/lab/runner/plan", { options }),
  startLabJob: (body: { label?: string; steps: LabJobStep[] }): Promise<LabJob> =>
    http.post("/lab/runner/jobs", body),
  cancelLabJob: (id: string): Promise<{ ok: boolean }> =>
    http.post(`/lab/runner/jobs/${encodeURIComponent(id)}/cancel`),
  deleteLabRun: (exp: string, runId: string): Promise<{ ok: boolean }> =>
    http.del(`/lab/experiments/${encodeURIComponent(exp)}/runs/${encodeURIComponent(runId)}`),
});
