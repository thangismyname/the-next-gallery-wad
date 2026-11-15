import type { HttpClient } from "../http";

export type AiPipeline = "clip" | "yolo" | "dino" | "tags";

export interface AiPipelineStatus {
  total: number;
  done: number;
  pending: number;
}

export interface AiBackfillBatch {
  done: number;
  failed: number;
  remaining: number;
}

const PIPELINES: Record<
  AiPipeline,
  { path: string; doneField: string; batch: number }
> = {
  clip: { path: "embed", doneField: "embedded", batch: 50 },
  yolo: { path: "detection", doneField: "detected", batch: 25 },
  dino: { path: "similar", doneField: "embedded", batch: 50 },
  tags: { path: "tags", doneField: "tagged", batch: 100 },
};

export const aiStatusQueryKey = (pipeline: AiPipeline) =>
  ["ai", "status", pipeline] as const;

export const createAiProcessingService = (http: HttpClient) => ({
  fetchAiStatus: async (pipeline: AiPipeline): Promise<AiPipelineStatus> => {
    const { path, doneField } = PIPELINES[pipeline];
    const data = await http.get<Record<string, unknown>>(
      `/gallery/media/${path}/status`,
    );
    return { total: Number(data?.total) || 0, done: Number(data?.[doneField]) || 0, pending: Number(data?.pending) || 0 };
  },

  runAiBackfillBatch: async (pipeline: AiPipeline): Promise<AiBackfillBatch> => {
    const { path, doneField, batch } = PIPELINES[pipeline];
    const data = await http.post<Record<string, unknown>>(
      `/gallery/media/${path}/backfill`,
      { limit: batch },
    );
    return {
      done: Number(data?.[doneField]) || 0,
      failed: Number(data?.failed) || 0,
      remaining: Number(data?.remaining) || 0,
    };
  },
});
