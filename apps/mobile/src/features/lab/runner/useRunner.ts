import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { labQueryKeys, type LabJobStep } from "@tng/shared";
import { isJobActive } from "@tng/shared/lab";
import { labApi } from "@/services";

const { cancelLabJob, fetchLabJob, fetchLabRunner, fetchLabRunnerSchema, startLabJob } = labApi;

/** Trạng thái runner: poll nhanh khi có job / terminal đang chạy. */
export const useRunnerState = () =>
  useQuery({
    queryKey: labQueryKeys.runner,
    queryFn: fetchLabRunner,
    refetchInterval: (q) => (q.state.data?.active || q.state.data?.external_running ? 3000 : 15000),
  });

/** Lệnh + tham số + preset (`python -m experiments.jobs describe`) — chỉ đổi khi sửa code experiments. */
export const useRunnerSchema = (enabled: boolean) =>
  useQuery({ queryKey: labQueryKeys.runnerSchema, queryFn: fetchLabRunnerSchema, enabled, staleTime: Infinity });

/** 1 job + đuôi log; poll 2 s khi đang chạy. Job vừa xong → làm mới kết quả Lab (run mới). */
export function useLabJob(id?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: labQueryKeys.job(id ?? ""),
    queryFn: () => fetchLabJob(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => (isJobActive(q.state.data?.state) ? 2000 : false),
  });
  const state = query.data?.state;
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !isJobActive(state)) {
      void qc.invalidateQueries({ queryKey: labQueryKeys.experiments });
      void qc.invalidateQueries({ queryKey: labQueryKeys.runner });
    }
    wasActive.current = isJobActive(state);
  }, [state, qc]);
  return query;
}

export function useRunnerActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: labQueryKeys.runner });
  const start = useMutation({
    mutationFn: (body: { label?: string; steps: LabJobStep[] }) => startLabJob(body),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelLabJob(id),
    onSuccess: (_, id) => {
      void refresh();
      void qc.invalidateQueries({ queryKey: labQueryKeys.job(id) });
    },
  });
  return { start, cancel };
}
