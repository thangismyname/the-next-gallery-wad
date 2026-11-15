import { useQuery, useQueryClient } from "@tanstack/react-query";
import { aiStatusQueryKey, type AiPipeline } from "@tng/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { aiProcessingApi } from "@/services";

/**
 * Status + batched backfill of one AI pipeline (web `hooks/useAiBackfill.ts`):
 * `run()` loops batches until nothing is left, stops when a batch processes 0
 * (ai-service down / stub provider) or the screen unmounts.
 */
export function useAiBackfill(pipeline: AiPipeline, { onBatch }: { onBatch?: () => void } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const status = useQuery({
    queryKey: aiStatusQueryKey(pipeline),
    queryFn: () => aiProcessingApi.fetchAiStatus(pipeline),
    staleTime: 30_000,
  });

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const run = async () => {
    cancelled.current = false;
    setRunning(true);
    setError(null);
    try {
      while (!cancelled.current) {
        const batch = await aiProcessingApi.runAiBackfillBatch(pipeline);
        await queryClient.invalidateQueries({ queryKey: aiStatusQueryKey(pipeline) });
        onBatch?.();
        if (batch.remaining <= 0) break;
        if (batch.done === 0) {
          setError(t("settings.ai.stalled"));
          break;
        }
      }
    } catch {
      setError(t("settings.ai.failed"));
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    cancelled.current = true;
  };

  return { status, running, error, run, stop };
}
