import { API_URL } from "@/lib/config";

/** Các pipeline AI chạy nền trên ảnh của user (xem AGENTS.md). */
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

// status/backfill endpoint + field "đã xử lý" của từng pipeline + cỡ lô
// (giới hạn theo schema backend: embed/similar ≤200, detection ≤100, tags ≤500).
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

async function readData(res: Response) {
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export async function fetchAiStatus(
  pipeline: AiPipeline,
): Promise<AiPipelineStatus> {
  const { path, doneField } = PIPELINES[pipeline];
  const data = await readData(
    await fetch(`${API_URL}/gallery/media/${path}/status`, {
      credentials: "include",
    }),
  );
  return { total: data.total, done: data[doneField], pending: data.pending };
}

/** Xử lý 1 lô ảnh còn thiếu của pipeline. */
export async function runAiBackfillBatch(
  pipeline: AiPipeline,
): Promise<AiBackfillBatch> {
  const { path, doneField, batch } = PIPELINES[pipeline];
  const data = await readData(
    await fetch(`${API_URL}/gallery/media/${path}/backfill`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: batch }),
    }),
  );
  return {
    done: data[doneField],
    failed: data.failed,
    remaining: Number(data.remaining),
  };
}
