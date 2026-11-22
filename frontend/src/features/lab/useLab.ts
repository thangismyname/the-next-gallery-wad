import { useQueries, useQuery } from "@tanstack/react-query";
import { labQueryKeys, type LabExperiment, type LabRun } from "@tng/shared";
import { fetchLabExperiments, fetchLabFile, fetchLabHistory, fetchLabRun } from "@/services/lab";

// Kết quả trên đĩa chỉ đổi khi chạy experiment mới → cache lâu, không refetch khi focus.
const STATIC = { staleTime: 60_000, refetchOnWindowFocus: false } as const;

export const useLabExperiments = () =>
  useQuery({ queryKey: labQueryKeys.experiments, queryFn: fetchLabExperiments, ...STATIC });

export const useLabRun = (exp?: string, runId?: string) =>
  useQuery({
    queryKey: labQueryKeys.run(exp ?? "", runId ?? ""),
    queryFn: () => fetchLabRun(exp!, runId!),
    enabled: Boolean(exp && runId),
    ...STATIC,
  });

export const useLabFile = (exp?: string, runId?: string, name?: string) =>
  useQuery({
    queryKey: labQueryKeys.file(exp ?? "", runId ?? "", name ?? ""),
    queryFn: () => fetchLabFile(exp!, runId!, name!),
    enabled: Boolean(exp && runId && name),
    ...STATIC,
  });

export const useLabHistory = (exp: string) =>
  useQuery({
    queryKey: labQueryKeys.history(exp),
    queryFn: () => fetchLabHistory(exp),
    ...STATIC,
  });

/** Run chính thức của experiment: latest.json, không có thì run không-smoke mới nhất. */
export const officialRun = (e: LabExperiment) =>
  e.latest ?? e.runs.find((r) => !r.smoke)?.run_id ?? e.runs[0]?.run_id;

/** result.json run chính thức của mọi experiment (tab Tổng quan) — cùng cache với useLabRun. */
export function useLabLatestResults(experiments: LabExperiment[]) {
  const queries = useQueries({
    queries: experiments.map((e) => {
      const runId = officialRun(e) ?? "";
      return {
        queryKey: labQueryKeys.run(e.exp, runId),
        queryFn: () => fetchLabRun(e.exp, runId),
        enabled: Boolean(runId),
        ...STATIC,
      };
    }),
  });
  return {
    loading: queries.some((q) => q.isLoading),
    results: Object.fromEntries(experiments.map((e, i) => [e.exp, queries[i].data?.result])),
    configs: Object.fromEntries(experiments.map((e, i) => [e.exp, queries[i].data?.config ?? null])),
  };
}

/** result.json của nhiều run 1 experiment (vd build: mỗi run dựng vài split) → [runId, result][] theo thứ tự `runIds`. */
export function useLabRunResults(exp: string, runIds: string[]) {
  const queries = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: labQueryKeys.run(exp, runId),
      queryFn: () => fetchLabRun(exp, runId),
      ...STATIC,
    })),
  });
  return {
    loading: queries.some((q) => q.isLoading),
    runs: runIds.map((id, i) => [id, queries[i].data?.result] as [string, unknown]),
  };
}

/** File CSV của run nếu run có file đó (không có → không gọi API). */
export const useRunCsv = (run: LabRun, name: string) =>
  useLabFile(run.exp, run.run_id, run.files.some((f) => f.name === name) ? name : undefined);
